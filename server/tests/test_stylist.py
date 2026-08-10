"""Outfit suggestion: shortlisting, validation, and the offline fallback."""

from __future__ import annotations

import pytest

from drobe.pipeline.stylist import (
    NoWardrobe,
    _coerce_picks,
    _fallback_picks,
    _shortlist,
    suggest,
)
from drobe.schemas import Category, Slot, SuggestRequest, WardrobeItem


def item(id_: str, slot: Slot, times_worn: int = 0) -> WardrobeItem:
    category = {
        Slot.TOP: Category.TOPS,
        Slot.BOTTOM: Category.BOTTOMS,
        Slot.FOOTWEAR: Category.FOOTWEAR,
        Slot.OUTERWEAR: Category.OUTERWEAR,
        Slot.ACCESSORY: Category.ACCESSORIES,
        Slot.NONE: Category.ELECTRONICS,
    }[slot]
    return WardrobeItem(id=id_, name=id_, category=category, slot=slot, times_worn=times_worn)


def test_shortlist_drops_unstylable_items():
    by_slot = _shortlist([item("tee", Slot.TOP), item("laptop", Slot.NONE)], set())

    assert Slot.TOP in by_slot
    # Inventory objects must never surface in the outfit carousels.
    assert Slot.NONE not in by_slot


def test_shortlist_orders_least_worn_first():
    by_slot = _shortlist(
        [item("worn", Slot.TOP, times_worn=30), item("fresh", Slot.TOP, times_worn=1)], set()
    )

    # Drives the product behaviour of nudging users toward neglected clothes.
    assert [i.id for i in by_slot[Slot.TOP]] == ["fresh", "worn"]


def test_shortlist_honours_exclusions():
    # Backs the "shuffle" button: re-asking must not return the same outfit.
    by_slot = _shortlist([item("tee", Slot.TOP), item("shirt", Slot.TOP)], {"tee"})
    assert [i.id for i in by_slot[Slot.TOP]] == ["shirt"]


def test_shortlist_caps_each_slot():
    many = [item(f"t{n}", Slot.TOP, times_worn=n) for n in range(80)]
    assert len(_shortlist(many, set())[Slot.TOP]) == 25


def test_coerce_rejects_hallucinated_ids():
    by_slot = _shortlist([item("tee", Slot.TOP)], set())

    # A model naming an item the user doesn't own would crash the carousel,
    # which has no entry for that id.
    assert _coerce_picks({"picks": {"top": "cardigan-that-does-not-exist"}}, by_slot) == {}


def test_coerce_rejects_a_pick_in_the_wrong_slot():
    by_slot = _shortlist([item("tee", Slot.TOP), item("jeans", Slot.BOTTOM)], set())
    assert _coerce_picks({"picks": {"bottom": "tee"}}, by_slot) == {}


def test_coerce_keeps_valid_picks_and_ignores_junk_slots():
    by_slot = _shortlist([item("tee", Slot.TOP)], set())
    picks = _coerce_picks({"picks": {"top": "tee", "hat": "tee"}}, by_slot)
    assert picks == {Slot.TOP: "tee"}


def test_fallback_picks_core_slots_only():
    by_slot = _shortlist(
        [
            item("tee", Slot.TOP),
            item("jeans", Slot.BOTTOM),
            item("boots", Slot.FOOTWEAR),
            item("scarf", Slot.ACCESSORY),
        ],
        set(),
    )
    picks = _fallback_picks(by_slot)

    assert set(picks) == {Slot.TOP, Slot.BOTTOM, Slot.FOOTWEAR}


@pytest.mark.asyncio
async def test_suggest_raises_when_nothing_is_stylable():
    request = SuggestRequest(items=[item("laptop", Slot.NONE)])

    with pytest.raises(NoWardrobe):
        await suggest(request)


@pytest.mark.asyncio
async def test_suggest_degrades_to_fallback_without_groq(no_groq):
    request = SuggestRequest(items=[item("tee", Slot.TOP), item("jeans", Slot.BOTTOM)])
    picks, rationale = await suggest(request)

    # Generate should still produce a wearable answer with the AI unavailable.
    assert picks == {Slot.TOP: "tee", Slot.BOTTOM: "jeans"}
    assert rationale
