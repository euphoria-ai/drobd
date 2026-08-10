"""Cutout -> item name, category, slot, colour."""

from __future__ import annotations

import base64
import logging

from ..config import get_settings
from ..schemas import CATEGORY_DEFAULT_SLOT, Category, Label, Slot
from .groq_client import get_client, parse_json_content

log = logging.getLogger(__name__)

_CATEGORIES = ", ".join(c.value for c in Category)
_SLOTS = ", ".join(s.value for s in Slot)

_PROMPT = f"""You label items for a personal wardrobe and inventory app.

The image shows a single item, already cut out and placed on a white background.

Reply with ONLY a JSON object of this exact shape:
{{
  "name": string,
  "category": one of [{_CATEGORIES}],
  "slot": one of [{_SLOTS}],
  "dominant_color": string,
  "confidence": number between 0 and 1
}}

Rules:
- "name" is a short lowercase noun phrase a person would actually say, 1-3 words.
  Good: "black hoodie", "running shoes", "game controller". Bad: "a photo of a
  black hooded sweatshirt on white".
- Do not include the colour in "name" unless it is how someone would naturally
  refer to the item.
- "slot" is where the item sits in an outfit. Use "none" for anything not worn,
  such as electronics or household objects.
- "dominant_color" is a single plain colour word, e.g. "navy", "cream", "black".
- "confidence" reflects how sure you are about name and category.
"""

#: Used when the model is unreachable or returns something unusable. The capture
#: flow must always reach the edit sheet -- the user can fix a wrong guess, but
#: cannot recover from a failed save.
FALLBACK = Label(
    name="item",
    category=Category.OTHERS,
    slot=Slot.NONE,
    dominant_color="",
    confidence=0.0,
)


def _coerce(raw: dict) -> Label:
    """Validate model output, repairing what can be repaired."""
    try:
        category = Category(str(raw.get("category", "")).strip().title())
    except ValueError:
        category = Category.OTHERS

    try:
        slot = Slot(str(raw.get("slot", "")).strip().lower())
    except ValueError:
        slot = CATEGORY_DEFAULT_SLOT[category]

    # A wearable category with slot "none" is almost always the model being
    # lazy rather than a real judgement, so fall back to the category default.
    if slot is Slot.NONE and CATEGORY_DEFAULT_SLOT[category] is not Slot.NONE:
        slot = CATEGORY_DEFAULT_SLOT[category]

    name = str(raw.get("name") or "").strip().lower()[:60] or FALLBACK.name

    try:
        confidence = min(1.0, max(0.0, float(raw.get("confidence", 0.5))))
    except (TypeError, ValueError):
        confidence = 0.5

    return Label(
        name=name,
        category=category,
        slot=slot,
        dominant_color=str(raw.get("dominant_color") or "").strip().lower()[:24],
        confidence=confidence,
    )


async def label(jpeg_bytes: bytes) -> Label:
    """Describe the item. Never raises -- returns FALLBACK on any failure."""
    settings = get_settings()
    data_url = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode()

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]

    # The vision model thinks before it answers, and reasoning tokens are spent
    # from the same budget as the reply. At 512 tokens it reasons until the
    # budget is gone, emits nothing, and JSON mode rejects the empty completion
    # server-side with json_validate_failed -- so every label silently became
    # FALLBACK. Turning reasoning off answers in ~25 tokens instead of ~1100.
    #
    # Not every model accepts reasoning_effort="none" (gpt-oss allows only
    # low/medium/high), so the second attempt drops it and buys the budget the
    # thinking needs instead. Between them the two cover either family.
    attempts: list[dict] = [
        {"max_completion_tokens": 512, "reasoning_effort": "none"},
        {"max_completion_tokens": 2048},
    ]

    for attempt, options in enumerate(attempts, start=1):
        try:
            client = get_client()
            completion = await client.chat.completions.create(
                model=settings.groq_vision_model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.2,
                **options,
            )
            return _coerce(parse_json_content(completion.choices[0].message.content))
        except Exception as exc:  # noqa: BLE001 - capture must not hard-fail
            log.warning("labelling attempt %d failed: %s", attempt, exc)

    return FALLBACK
