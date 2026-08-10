from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from drobe.config import get_settings
from drobe.pipeline.groq_client import get_client


@pytest.fixture(autouse=True)
def _clear_caches():
    """Keep a developer's real .env from leaking into assertions."""
    get_settings.cache_clear()
    get_client.cache_clear()
    yield
    get_settings.cache_clear()
    get_client.cache_clear()


@pytest.fixture
def no_groq(monkeypatch):
    """Simulate an unconfigured or unreachable Groq.

    An explicit empty environment variable wins over any value in a local .env,
    so this holds even on a machine with a real key configured.
    """
    monkeypatch.setenv("GROQ_API_KEY", "")
    get_settings.cache_clear()
    get_client.cache_clear()


@pytest.fixture
def soft_edged_rgba() -> Image.Image:
    """A red disc on a large transparent canvas, with a soft alpha fringe.

    Stands in for real segmenter output: the subject occupies a small part of
    the frame and its edge fades rather than stopping cleanly.
    """
    size = 200
    yy, xx = np.mgrid[0:size, 0:size]
    distance = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2)

    # 1.0 inside radius 40, ramping to 0.0 at radius 50.
    alpha = np.clip((50 - distance) / 10, 0, 1)

    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = 220  # red subject
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")
