"""Label parsing and repair.

The vision model is the least predictable part of the pipeline, so everything
here is about surviving bad output rather than trusting good output.
"""

from __future__ import annotations

import pytest

from drobe.pipeline.groq_client import parse_json_content
from drobe.pipeline.labeler import FALLBACK, _coerce, label
from drobe.schemas import Category, Slot


def test_parses_a_plain_json_object():
    assert parse_json_content('{"name": "black hoodie"}') == {"name": "black hoodie"}


def test_strips_a_thinking_block():
    # The current Groq vision model has a thinking mode that can leak past
    # JSON mode. Losing a capture to that would be unacceptable.
    raw = '<think>The item looks like a shoe.</think>\n{"name": "running shoes"}'
    assert parse_json_content(raw) == {"name": "running shoes"}


def test_recovers_json_wrapped_in_prose():
    raw = 'Here you go:\n```json\n{"name": "tote bag"}\n```\nHope that helps.'
    assert parse_json_content(raw) == {"name": "tote bag"}


@pytest.mark.parametrize("content", ["", None, "no object here"])
def test_rejects_unusable_content(content):
    with pytest.raises(ValueError):
        parse_json_content(content)


def test_coerce_accepts_well_formed_output():
    result = _coerce(
        {
            "name": "Black Hoodie",
            "category": "Tops",
            "slot": "top",
            "dominant_color": "Black",
            "confidence": 0.9,
        }
    )

    assert result.name == "black hoodie"  # normalised for display
    assert result.category is Category.TOPS
    assert result.slot is Slot.TOP
    assert result.dominant_color == "black"
    assert result.confidence == 0.9


def test_invented_category_falls_back_to_others():
    result = _coerce({"name": "thing", "category": "Sportswear", "slot": "top"})
    assert result.category is Category.OTHERS


def test_missing_slot_is_derived_from_category():
    result = _coerce({"name": "jeans", "category": "Bottoms"})
    assert result.slot is Slot.BOTTOM


def test_wearable_item_is_never_left_unstylable():
    # A model that answers "none" for a pair of shoes has been lazy, not
    # insightful. Trusting it would silently hide the item from the outfit tab.
    result = _coerce({"name": "boots", "category": "Footwear", "slot": "none"})
    assert result.slot is Slot.FOOTWEAR


def test_non_wearable_item_keeps_slot_none():
    result = _coerce({"name": "laptop", "category": "Electronics", "slot": "none"})
    assert result.slot is Slot.NONE


@pytest.mark.parametrize("confidence", ["very high", None, 5, -2])
def test_bad_confidence_is_clamped_or_defaulted(confidence):
    result = _coerce({"name": "x", "category": "Others", "confidence": confidence})
    assert 0.0 <= result.confidence <= 1.0


def test_empty_name_falls_back():
    assert _coerce({"name": "   ", "category": "Others"}).name == FALLBACK.name


@pytest.mark.asyncio
async def test_label_returns_fallback_when_groq_is_unconfigured(no_groq):
    # Both attempts fail, but the user must still land on the edit sheet --
    # they can correct a wrong guess, they cannot recover from a capture that
    # threw away their photo.
    assert await label(b"not-a-real-jpeg") == FALLBACK
