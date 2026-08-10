"""HTTP surface: the FastAPI endpoints, with the heavy pipeline mocked out."""

from __future__ import annotations

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from drobe.config import get_settings
from drobe.pipeline.cutout import Cutout
from drobe.schemas import Category, Label, Slot


@pytest.fixture
def client(monkeypatch):
    # The real lifespan loads a 200MB segmentation model; stub it so tests stay
    # offline and fast.
    monkeypatch.setattr("drobe.pipeline.cutout.warm_up", lambda: None)
    from drobe.main import app

    with TestClient(app) as test_client:
        yield test_client


def _small_cutout() -> Cutout:
    img = Image.new("RGBA", (10, 12), (220, 0, 0, 255))
    return Cutout(image=img, width=10, height=12)


def test_healthz_reports_configuration(client, no_groq):
    body = client.get("/healthz").json()

    assert body["ok"] is True
    assert body["groq_configured"] is False
    assert "rembg_model" in body


def test_process_returns_cutout_and_label(client, monkeypatch):
    async def fake_label(_jpeg: bytes) -> Label:
        return Label(
            name="black hoodie",
            category=Category.TOPS,
            slot=Slot.TOP,
            dominant_color="black",
            confidence=0.9,
        )

    monkeypatch.setattr("drobe.pipeline.cutout.segment", lambda _data: _small_cutout())
    monkeypatch.setattr("drobe.pipeline.labeler.label", fake_label)

    resp = client.post(
        "/v1/process", files={"image": ("shirt.jpg", b"raw-bytes", "image/jpeg")}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "black hoodie"
    assert body["category"] == "Tops"
    assert body["slot"] == "top"
    assert body["width"] == 10
    assert body["height"] == 12
    # The returned base64 must decode to a real PNG.
    png = Image.open(io.BytesIO(base64.b64decode(body["cutout_png_b64"])))
    assert png.format == "PNG"


def test_process_rejects_an_unsupported_content_type(client):
    resp = client.post(
        "/v1/process", files={"image": ("doc.pdf", b"%PDF-1.4", "application/pdf")}
    )
    assert resp.status_code == 415


def test_process_rejects_an_empty_upload(client):
    resp = client.post("/v1/process", files={"image": ("empty.jpg", b"", "image/jpeg")})
    assert resp.status_code == 400


def test_process_rejects_an_oversize_upload(client, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "0")
    get_settings.cache_clear()

    resp = client.post("/v1/process", files={"image": ("big.jpg", b"xxxx", "image/jpeg")})
    assert resp.status_code == 413


def test_process_maps_a_segmentation_failure_to_422(client, monkeypatch):
    def boom(_data: bytes) -> Cutout:
        raise RuntimeError("no subject found")

    monkeypatch.setattr("drobe.pipeline.cutout.segment", boom)

    resp = client.post(
        "/v1/process", files={"image": ("shirt.jpg", b"raw-bytes", "image/jpeg")}
    )
    assert resp.status_code == 422


def test_suggest_outfit_returns_picks_via_fallback(client, no_groq):
    payload = {
        "items": [
            {"id": "tee", "name": "tee", "category": "Tops", "slot": "top"},
            {"id": "jeans", "name": "jeans", "category": "Bottoms", "slot": "bottom"},
        ]
    }
    resp = client.post("/v1/suggest-outfit", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["picks"]["top"] == "tee"
    assert body["picks"]["bottom"] == "jeans"
    assert body["rationale"]


def test_suggest_outfit_422_when_nothing_is_stylable(client):
    payload = {
        "items": [
            {"id": "laptop", "name": "laptop", "category": "Electronics", "slot": "none"}
        ]
    }
    resp = client.post("/v1/suggest-outfit", json=payload)
    assert resp.status_code == 422
