"""Wardrobe -> a suggested outfit.

Text-only. The app sends what it already knows about each item, so the stylist
never needs to see an image and the call stays fast enough to feel interactive.
"""

from __future__ import annotations

import json
import logging

from ..config import get_settings
from ..schemas import Slot, SuggestRequest, WardrobeItem
from .groq_client import get_client, parse_json_content

log = logging.getLogger(__name__)

#: Slots the stylist is allowed to fill. `none` items are inventory, not outfit
#: pieces, so they are filtered out before the model ever sees them.
STYLABLE_SLOTS = (Slot.OUTERWEAR, Slot.TOP, Slot.BOTTOM, Slot.FOOTWEAR, Slot.ACCESSORY)

#: Sending an entire wardrobe would blow the context and slow the call down.
#: Least-worn first, so suggestions naturally favour neglected items.
_MAX_ITEMS_PER_SLOT = 25

_SYSTEM = """You are a personal stylist. You pick outfits only from the exact \
items the user owns. You never invent items and never return an id that was not \
given to you. You favour items the user rarely wears when they work as well as \
the alternatives."""


class NoWardrobe(ValueError):
    """Not enough stylable items to build an outfit."""


def _shortlist(items: list[WardrobeItem], exclude: set[str]) -> dict[Slot, list[WardrobeItem]]:
    by_slot: dict[Slot, list[WardrobeItem]] = {slot: [] for slot in STYLABLE_SLOTS}
    for item in items:
        if item.id in exclude or item.slot not in by_slot:
            continue
        by_slot[item.slot].append(item)

    for slot, candidates in by_slot.items():
        candidates.sort(key=lambda i: i.times_worn)
        by_slot[slot] = candidates[:_MAX_ITEMS_PER_SLOT]

    return {slot: candidates for slot, candidates in by_slot.items() if candidates}


def _build_prompt(request: SuggestRequest, by_slot: dict[Slot, list[WardrobeItem]]) -> str:
    wardrobe = {
        slot.value: [
            {
                "id": item.id,
                "name": item.name,
                "color": item.dominant_color,
                "times_worn": item.times_worn,
            }
            for item in candidates
        ]
        for slot, candidates in by_slot.items()
    }

    context = []
    if request.occasion:
        context.append(f"Occasion: {request.occasion}")
    if request.weather:
        context.append(f"Weather: {request.weather}")
    context_block = "\n".join(context) or "No particular occasion."

    fillable = ", ".join(slot.value for slot in by_slot)

    return f"""{context_block}

The user's wardrobe, grouped by slot:
{json.dumps(wardrobe, indent=2)}

Choose at most one item per slot. You may leave a slot empty if including it
would not improve the outfit -- for example, skip outerwear in warm weather.

Reply with ONLY a JSON object:
{{
  "picks": {{ "<slot>": "<item id>" }},
  "rationale": "one short sentence, under 20 words, addressed to the user"
}}

Valid slots: {fillable}. Every id must come from the wardrobe above."""


def _coerce_picks(raw: dict, by_slot: dict[Slot, list[WardrobeItem]]) -> dict[Slot, str]:
    """Keep only picks that name a real item in a real slot."""
    valid_ids = {slot: {item.id for item in items} for slot, items in by_slot.items()}
    picks: dict[Slot, str] = {}

    for slot_name, item_id in (raw.get("picks") or {}).items():
        try:
            slot = Slot(str(slot_name).strip().lower())
        except ValueError:
            continue
        if slot in valid_ids and str(item_id) in valid_ids[slot]:
            picks[slot] = str(item_id)

    return picks


def _fallback_picks(by_slot: dict[Slot, list[WardrobeItem]]) -> dict[Slot, str]:
    """Least-worn item in each core slot. Used when the model is unavailable."""
    core = (Slot.TOP, Slot.BOTTOM, Slot.FOOTWEAR)
    return {slot: by_slot[slot][0].id for slot in core if by_slot.get(slot)}


async def suggest(request: SuggestRequest) -> tuple[dict[Slot, str], str]:
    """Return (picks, rationale). Never raises except NoWardrobe."""
    by_slot = _shortlist(request.items, set(request.exclude_item_ids))
    if not by_slot:
        raise NoWardrobe("no stylable items in wardrobe")

    settings = get_settings()
    try:
        client = get_client()
        completion = await client.chat.completions.create(
            model=settings.groq_text_model,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_prompt(request, by_slot)},
            ],
            response_format={"type": "json_object"},
            temperature=0.8,  # some variety, so "shuffle" feels alive
            max_completion_tokens=512,
        )
        raw = parse_json_content(completion.choices[0].message.content)
        picks = _coerce_picks(raw, by_slot)
        if picks:
            rationale = str(raw.get("rationale") or "").strip()[:140]
            return picks, rationale
        log.warning("stylist returned no usable picks; falling back")
    except Exception as exc:  # noqa: BLE001 - degrade instead of failing
        log.warning("stylist call failed: %s", exc)

    return _fallback_picks(by_slot), "Picked from what you've worn least."
