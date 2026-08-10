"""Stylist behaviour against a mocked Groq client, plus prompt assembly."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from drobe.pipeline.stylist import STYLABLE_SLOTS, _build_prompt, _shortlist, suggest
from drobe.schemas import Category, Slot, SuggestRequest, WardrobeItem


def _item(id_: str, slot: Slot, times_worn: int = 0) -> WardrobeItem:
    category = {
        Slot.TOP: Category.TOPS,
        Slot.BOTTOM: Category.BOTTOMS,
        Slot.FOOTWEAR: Category.FOOTWEAR,
        Slot.OUTERWEAR: Category.OUTERWEAR,
        Slot.ACCESSORY: Category.ACCESSORIES,
        Slot.NONE: Category.ELECTRONICS,
    }[slot]
    return WardrobeItem(id=id_, name=id_, category=category, slot=slot, times_worn=times_worn)


def _completion(content: str) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _FakeGroq:
    def __init__(self, result):
        self._result = result
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self._result, Exception):
            raise self._result
        return _completion(self._result)


@pytest.mark.asyncio
async def test_suggest_uses_the_models_picks(monkeypatch):
    fake = _FakeGroq(
        json.dumps(
            {
                "picks": {"top": "tee", "bottom": "jeans"},
                "rationale": "Fresh and easy for the office.",
            }
        )
    )
    monkeypatch.setattr("drobe.pipeline.stylist.get_client", lambda: fake)

    request = SuggestRequest(items=[_item("tee", Slot.TOP), _item("jeans", Slot.BOTTOM)])
    picks, rationale = await suggest(request)

    assert picks == {Slot.TOP: "tee", Slot.BOTTOM: "jeans"}
    assert rationale == "Fresh and easy for the office."


@pytest.mark.asyncio
async def test_suggest_truncates_a_long_rationale(monkeypatch):
    fake = _FakeGroq(json.dumps({"picks": {"top": "tee"}, "rationale": "x" * 300}))
    monkeypatch.setattr("drobe.pipeline.stylist.get_client", lambda: fake)

    _picks, rationale = await suggest(SuggestRequest(items=[_item("tee", Slot.TOP)]))

    assert len(rationale) == 140


@pytest.mark.asyncio
async def test_suggest_falls_back_when_model_picks_are_unusable(monkeypatch):
    fake = _FakeGroq(
        json.dumps(
            {"picks": {"top": "item-the-user-does-not-own"}, "rationale": "should be discarded"}
        )
    )
    monkeypatch.setattr("drobe.pipeline.stylist.get_client", lambda: fake)

    request = SuggestRequest(items=[_item("tee", Slot.TOP), _item("jeans", Slot.BOTTOM)])
    picks, rationale = await suggest(request)

    assert picks == {Slot.TOP: "tee", Slot.BOTTOM: "jeans"}
    assert rationale == "Picked from what you've worn least."


@pytest.mark.asyncio
async def test_suggest_falls_back_when_the_call_raises(monkeypatch):
    fake = _FakeGroq(RuntimeError("network down"))
    monkeypatch.setattr("drobe.pipeline.stylist.get_client", lambda: fake)

    picks, rationale = await suggest(SuggestRequest(items=[_item("tee", Slot.TOP)]))

    assert picks == {Slot.TOP: "tee"}
    assert rationale == "Picked from what you've worn least."


def test_build_prompt_carries_context_and_item_ids():
    request = SuggestRequest(
        items=[_item("tee", Slot.TOP)], occasion="dinner", weather="12C, raining"
    )
    by_slot = _shortlist(request.items, set())
    prompt = _build_prompt(request, by_slot)

    assert "dinner" in prompt
    assert "12C, raining" in prompt
    assert "tee" in prompt


def test_build_prompt_notes_when_there_is_no_occasion():
    request = SuggestRequest(items=[_item("tee", Slot.TOP)])
    prompt = _build_prompt(request, _shortlist(request.items, set()))
    assert "No particular occasion." in prompt


def test_stylable_slots_never_include_none():
    assert Slot.NONE not in STYLABLE_SLOTS
