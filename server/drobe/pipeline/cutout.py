"""Photo -> clean transparent cutout.

Deliberately does NOT bake an outline into the PNG. The app supports both a
black and a white ground, and a baked white stroke is invisible on white and
impossible to remove. The stroke is drawn on-device instead, themed to match.
See the design notes in the plan for the reasoning.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from ..config import get_settings

# Alpha below this is treated as "not part of the item" when trimming.
_TRIM_THRESHOLD = 8
# Transparent margin left around the item, as a fraction of the longest edge.
_PAD_RATIO = 0.02
# How far to push opaque colour into the transparent region. Prevents dark
# halos when the sprite is scaled down in the pile.
_BLEED_ITERATIONS = 4


@dataclass(frozen=True)
class Cutout:
    image: Image.Image  # RGBA, straight (non-premultiplied) alpha
    width: int
    height: int

    def to_png_bytes(self) -> bytes:
        buf = io.BytesIO()
        self.image.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    def to_label_jpeg_bytes(self) -> bytes:
        """Flatten onto white as JPEG for the vision model.

        Transparency reads as black to most vision encoders, which biases the
        colour it reports. Compositing onto white avoids that, and JPEG keeps
        the request small.
        """
        settings = get_settings()
        flat = Image.new("RGB", self.image.size, (255, 255, 255))
        flat.paste(self.image, mask=self.image.getchannel("A"))
        flat.thumbnail(
            (settings.label_max_edge, settings.label_max_edge), Image.Resampling.LANCZOS
        )
        buf = io.BytesIO()
        flat.save(buf, format="JPEG", quality=85, optimize=True)
        return buf.getvalue()


@lru_cache(maxsize=1)
def _session():
    """Load the segmentation model once and reuse it across requests."""
    from rembg import new_session

    return new_session(get_settings().rembg_model)


def warm_up() -> None:
    """Force model load at startup so the first real request isn't slow."""
    _session()


def _decode(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    # Phone cameras record orientation in EXIF rather than rotating pixels.
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def _trim(img: Image.Image) -> Image.Image:
    alpha = img.getchannel("A")
    mask = alpha.point(lambda v: 255 if v > _TRIM_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        # Segmenter found nothing. Hand back the original rather than a 0x0
        # crop; the caller decides whether that's an error.
        return img

    pad = max(2, int(max(img.size) * _PAD_RATIO))
    left, top, right, bottom = bbox
    return img.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(img.width, right + pad),
            min(img.height, bottom + pad),
        )
    )


def _firm_edges(img: Image.Image) -> Image.Image:
    """Smooth then re-contrast the alpha.

    The raw mask has a soft, noisy fringe. Blurring and then stretching the
    midtones gives an edge that is antialiased but decisive, which is what the
    on-device dilate needs to produce an even stroke.
    """
    alpha = img.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))

    lo, hi = 24, 232
    span = hi - lo
    curve = [0 if v < lo else 255 if v > hi else int((v - lo) * 255 / span) for v in range(256)]
    img.putalpha(alpha.point(curve))
    return img


def _bleed_edges(img: Image.Image) -> Image.Image:
    """Extend edge colour outward underneath the transparent fringe.

    Fully transparent pixels carry arbitrary RGB. When the GPU samples across
    the boundary while scaling, that garbage bleeds in as a dark rim. Repeatedly
    dilating the colour channels into transparent territory removes it. Alpha is
    untouched, so nothing becomes visible that wasn't already.
    """
    arr = np.array(img)
    rgb, alpha = arr[..., :3], arr[..., 3]

    filled = alpha > 0
    out = rgb.copy()
    for _ in range(_BLEED_ITERATIONS):
        holes = ~filled
        if not holes.any():
            break

        # Max-filter each channel, but only read from already-filled pixels.
        src = Image.fromarray(np.where(filled[..., None], out, 0))
        grown = np.array(src.filter(ImageFilter.MaxFilter(3)))
        cover = np.array(
            Image.fromarray((filled * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
        ) > 0

        newly = holes & cover
        out[newly] = grown[newly]
        filled = filled | newly

    return Image.fromarray(np.dstack([out, alpha]), mode="RGBA")


def segment(data: bytes) -> Cutout:
    """Run the full photo -> cutout pipeline. CPU-bound; call off the loop."""
    from rembg import remove

    settings = get_settings()

    img = _decode(data)
    img.thumbnail(
        (settings.segment_max_edge, settings.segment_max_edge), Image.Resampling.LANCZOS
    )

    result = remove(
        img,
        session=_session(),
        alpha_matting=settings.rembg_alpha_matting,
        post_process_mask=True,
    )
    if result.mode != "RGBA":
        result = result.convert("RGBA")

    result = _trim(result)
    result = _firm_edges(result)
    result = _bleed_edges(result)

    if max(result.size) > settings.cutout_max_edge:
        result.thumbnail(
            (settings.cutout_max_edge, settings.cutout_max_edge), Image.Resampling.LANCZOS
        )

    return Cutout(image=result, width=result.width, height=result.height)
