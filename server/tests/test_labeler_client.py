"""Labeller behaviour against a mocked Groq client."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from drobe.pipeline.labeler import FALLBACK, _coerce, label
from drobe.schemas import Category, Slot


def _completion(content: str) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _FakeGroq:
    """Returns queued contents (or raises queued exceptions) per create() call."""

    def __init__(self, results):
        self._results = list(results)
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        result = self._results.pop(0)
        if isinstance(result, Exception):
            raise result
        return _completion(result)


@pytest.mark.asyncio
async def test_label_parses_a_successful_response(monkeypatch):
    fake = _FakeGroq(
        [
            json.dumps(
                {
                    "name": "Black Hoodie",
                    "category": "Tops",
                    "slot": "top",
                    "dominant_color": "Black",
                    "confidence": 0.9,
                }
            )
        ]
    )
    monkeypatch.setattr("drobe.pipeline.labeler.get_client", lambda: fake)

    result = await label(b"jpeg-bytes")

    assert result.name == "black hoodie"
    assert result.category is Category.TOPS
    assert result.slot is Slot.TOP
    # First attempt turns reasoning off; that's what keeps the model from
    # spending its whole budget thinking.
    assert len(fake.calls) == 1
    assert fake.calls[0]["reasoning_effort"] == "none"


@pytest.mark.asyncio
async def test_label_retries_without_reasoning_effort(monkeypatch):
    fake = _FakeGroq(
        [
            RuntimeError("json_validate_failed"),
            json.dumps({"name": "tote bag", "category": "Bags", "slot": "accessory"}),
        ]
    )
    monkeypatch.setattr("drobe.pipeline.labeler.get_client", lambda: fake)

    result = await label(b"jpeg-bytes")

    assert result.name == "tote bag"
    assert result.category is Category.BAGS
    assert len(fake.calls) == 2
    # The retry drops reasoning_effort so models that reject "none" still answer.
    assert "reasoning_effort" not in fake.calls[1]


@pytest.mark.asyncio
async def test_label_falls_back_when_every_attempt_fails(monkeypatch):
    fake = _FakeGroq([RuntimeError("boom"), RuntimeError("boom again")])
    monkeypatch.setattr("drobe.pipeline.labeler.get_client", lambda: fake)

    assert await label(b"jpeg-bytes") == FALLBACK


def test_coerce_truncates_and_normalises_long_fields():
    result = _coerce(
        {
            "name": "A Very Long Name " * 10,
            "category": "tops",
            "slot": "top",
            "dominant_color": "A Very Long Colour Name That Keeps Going",
        }
    )

    assert len(result.name) <= 60
    assert result.name == result.name.lower()
    assert len(result.dominant_color) <= 24
    # Lowercased category string still resolves.
    assert result.category is Category.TOPS
