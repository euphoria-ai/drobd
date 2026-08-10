"""Alpha handling for cutouts.

These run on synthetic images so they don't need the 200MB segmentation model.
The one test that does exercise rembg is opt-in via DROBE_TEST_SEGMENT=1.
"""

from __future__ import annotations

import io
import os

import numpy as np
import pytest
from PIL import Image

from drobe.pipeline.cutout import Cutout, _bleed_edges, _firm_edges, _trim


def test_trim_crops_to_the_subject(soft_edged_rgba: Image.Image):
    trimmed = _trim(soft_edged_rgba)

    # Subject is a disc of radius ~50 in a 200px frame, so trimming should cut
    # the canvas down substantially while keeping the whole disc.
    assert trimmed.width < soft_edged_rgba.width
    assert trimmed.height < soft_edged_rgba.height
    assert trimmed.width >= 100
    assert trimmed.height >= 100


def test_trim_survives_an_empty_mask():
    blank = Image.fromarray(np.zeros((64, 64, 4), dtype=np.uint8), mode="RGBA")

    # A fully transparent frame means the segmenter found nothing. Returning
    # the original keeps the error decision with the caller instead of raising
    # from a zero-area crop.
    assert _trim(blank).size == (64, 64)


def test_firm_edges_removes_the_soft_fringe(soft_edged_rgba: Image.Image):
    before = np.array(soft_edged_rgba.getchannel("A"))
    after = np.array(_firm_edges(soft_edged_rgba.copy()).getchannel("A"))

    def midtones(a: np.ndarray) -> int:
        return int(((a > 24) & (a < 232)).sum())

    # The point of the pass: fewer half-transparent pixels, so the on-device
    # dilate produces an even stroke instead of a fuzzy one.
    assert midtones(after) < midtones(before)
    # Solid interior and empty exterior must both survive.
    assert after.max() == 255
    assert after.min() == 0


def test_bleed_fills_transparent_pixels_with_edge_colour():
    # Left half opaque red, right half fully transparent *and* black. Sampling
    # across that boundary is what produces dark halos when scaling.
    rgba = np.zeros((32, 32, 4), dtype=np.uint8)
    rgba[:, :16, 0] = 220
    rgba[:, :16, 3] = 255
    bled = np.array(_bleed_edges(Image.fromarray(rgba, mode="RGBA")))

    # Colour must have spread rightward into the transparent region...
    assert bled[16, 17, 0] > 0
    # ...without making any of it visible.
    assert bled[16, 17, 3] == 0
    # And the opaque side must be untouched.
    assert bled[16, 8, 0] == 220
    assert bled[16, 8, 3] == 255


def test_png_output_keeps_transparency_and_bakes_no_outline(soft_edged_rgba: Image.Image):
    firmed = _firm_edges(_trim(soft_edged_rgba))
    png = Image.open(io.BytesIO(Cutout(firmed, firmed.width, firmed.height).to_png_bytes()))

    assert png.mode == "RGBA"
    alpha = np.array(png.getchannel("A"))

    # Guards the design decision: the stroke is drawn on-device so it can be
    # themed. If an outline ever gets baked in here, the border of the padded
    # crop stops being transparent and this fails.
    assert alpha[0, :].max() == 0
    assert alpha[-1, :].max() == 0
    assert alpha[:, 0].max() == 0
    assert alpha[:, -1].max() == 0


def test_label_jpeg_flattens_onto_white(soft_edged_rgba: Image.Image):
    cutout = Cutout(soft_edged_rgba, soft_edged_rgba.width, soft_edged_rgba.height)
    flat = Image.open(io.BytesIO(cutout.to_label_jpeg_bytes()))

    assert flat.mode == "RGB"
    # Transparent background must read as white, not black -- black skews the
    # colour the vision model reports.
    corner = np.array(flat)[0, 0]
    assert corner.min() > 240


@pytest.mark.skipif(
    os.environ.get("DROBE_TEST_SEGMENT") != "1",
    reason="downloads a ~200MB model; set DROBE_TEST_SEGMENT=1 to run",
)
def test_segment_end_to_end_produces_a_real_cutout():
    from drobe.pipeline.cutout import segment

    photo = Image.new("RGB", (600, 600), (240, 240, 240))
    photo.paste(Image.new("RGB", (200, 300), (30, 30, 120)), (200, 150))
    buf = io.BytesIO()
    photo.save(buf, format="JPEG")

    result = segment(buf.getvalue())
    alpha = np.array(result.image.getchannel("A"))

    assert result.image.mode == "RGBA"
    assert alpha.max() == 255  # something was kept
    assert alpha.min() == 0  # something was removed
