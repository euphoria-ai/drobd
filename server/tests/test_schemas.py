"""Vocabulary and validation for the shared pydantic models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from drobe.schemas import (
    CATEGORY_DEFAULT_SLOT,
    Category,
    Label,
    ProcessResponse,
    Slot,
    SuggestRequest,
    SuggestResponse,
    WardrobeItem,
)


def test_every_category_has_a_default_slot():
    # labeler._coerce indexes CATEGORY_DEFAULT_SLOT with an arbitrary category,
    # so a missing entry would be a KeyError in production.
    for category in Category:
        assert category in CATEGORY_DEFAULT_SLOT
        assert isinstance(CATEGORY_DEFAULT_SLOT[category], Slot)


def test_category_values_are_stable_strings():
    # These strings are persisted and mirrored in the app's taxonomy, so a
    # rename here is a breaking change and this pins them.
    assert Category.TOPS.value == "Tops"
    assert Category("Tops") is Category.TOPS
    assert Slot.TOP.value == "top"
    assert Slot("none") is Slot.NONE


def test_label_confidence_must_be_within_bounds():
    with pytest.raises(ValidationError):
        Label(name="x", category=Category.TOPS, slot=Slot.TOP, dominant_color="", confidence=1.5)
    with pytest.raises(ValidationError):
        Label(name="x", category=Category.TOPS, slot=Slot.TOP, dominant_color="", confidence=-0.1)


def test_wardrobe_item_has_sensible_defaults():
    stored = WardrobeItem(id="1", name="tee", category=Category.TOPS, slot=Slot.TOP)
    assert stored.dominant_color == ""
    assert stored.times_worn == 0


def test_suggest_request_defaults():
    request = SuggestRequest(items=[])
    assert request.occasion is None
    assert request.weather is None
    assert request.exclude_item_ids == []


def test_suggest_response_serialises_slot_keys_as_strings():
    response = SuggestResponse(picks={Slot.TOP: "tee"}, rationale="ok", ms=3)
    assert response.model_dump()["picks"][Slot.TOP] == "tee"
    assert response.model_dump(mode="json")["picks"] == {"top": "tee"}


def test_process_response_round_trips():
    payload = ProcessResponse(
        cutout_png_b64="AAAA",
        width=10,
        height=20,
        name="tee",
        category=Category.TOPS,
        slot=Slot.TOP,
        dominant_color="black",
        confidence=0.5,
        ms=12,
    )
    restored = ProcessResponse.model_validate(payload.model_dump())
    assert restored == payload
