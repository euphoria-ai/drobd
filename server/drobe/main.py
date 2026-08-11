"""drobe AI service.

Stateless by design: an image goes in, a cutout and its labels come out. The
service holds no database credentials and no user data, so it can be restarted
or redeployed without touching the app's storage, and an outage degrades the app
to "cannot add new items" rather than "cannot open".
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .pipeline import cutout as cutout_pipeline
from .pipeline import labeler, stylist
from .schemas import ProcessResponse, SuggestRequest, SuggestResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("drobe")

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Loading the segmentation model takes several seconds. Doing it here means
    # the first capture of a session isn't the one that pays for it.
    await asyncio.to_thread(cutout_pipeline.warm_up)
    log.info("segmentation model ready (%s)", get_settings().rembg_model)
    yield


app = FastAPI(title="drobe", version="0.1.0", lifespan=lifespan)

# The app talks to this service directly from the device over LAN in
# development, so the origin is never predictable.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    settings = get_settings()
    return {
        "ok": True,
        "rembg_model": settings.rembg_model,
        "vision_model": settings.groq_vision_model,
        "text_model": settings.groq_text_model,
        "groq_configured": bool(settings.groq_api_key),
    }


@app.post("/v1/process", response_model=ProcessResponse)
async def process(image: UploadFile = File(...)) -> ProcessResponse:
    """Segment an item out of a photo and describe it."""
    settings = get_settings()
    started = time.perf_counter()

    if image.content_type and image.content_type.lower() not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, f"unsupported content type: {image.content_type}")

    data = await image.read()
    if not data:
        raise HTTPException(400, "empty upload")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, f"image exceeds {settings.max_upload_mb}MB")

    segment_started = time.perf_counter()
    try:
        result = await asyncio.to_thread(cutout_pipeline.segment, data)
    except Exception as exc:
        log.exception("segmentation failed")
        raise HTTPException(422, f"could not process image: {exc}") from exc
    segment_ms = int((time.perf_counter() - segment_started) * 1000)

    # Encoding the PNG is pure CPU too, and the label call is pure waiting, so
    # overlapping them hides most of the model latency.
    label_started = time.perf_counter()
    png_task = asyncio.create_task(asyncio.to_thread(result.to_png_bytes))
    jpeg = await asyncio.to_thread(result.to_label_jpeg_bytes)
    label, png = await asyncio.gather(labeler.label(jpeg), png_task)
    label_ms = int((time.perf_counter() - label_started) * 1000)

    # The app aborts the request after a fixed budget, and an abort is
    # indistinguishable from an unreachable server on the client. Logging the
    # split makes it obvious which stage spent the budget.
    log.info(
        "processed %.1fKB in %dms (segment %dms via %s, label %dms)",
        len(data) / 1024,
        int((time.perf_counter() - started) * 1000),
        segment_ms,
        settings.rembg_model,
        label_ms,
    )

    return ProcessResponse(
        cutout_png_b64=base64.b64encode(png).decode(),
        width=result.width,
        height=result.height,
        name=label.name,
        category=label.category,
        slot=label.slot,
        dominant_color=label.dominant_color,
        confidence=label.confidence,
        ms=int((time.perf_counter() - started) * 1000),
    )


@app.post("/v1/suggest-outfit", response_model=SuggestResponse)
async def suggest_outfit(request: SuggestRequest) -> SuggestResponse:
    """Pick an outfit from the items the user actually owns."""
    started = time.perf_counter()
    try:
        picks, rationale = await stylist.suggest(request)
    except stylist.NoWardrobe as exc:
        raise HTTPException(422, str(exc)) from exc

    return SuggestResponse(
        picks=picks,
        rationale=rationale,
        ms=int((time.perf_counter() - started) * 1000),
    )
