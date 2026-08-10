"""Shared types for the drobe AI pipeline.

The category and slot vocabularies are duplicated in the mobile app
(`app/src/lib/taxonomy.ts`). They must stay in sync -- the app filters chips by
category and builds outfit carousels by slot, and the server is what assigns
both. Changing a value here is a breaking change for stored rows.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Category(str, Enum):
    TOPS = "Tops"
    BOTTOMS = "Bottoms"
    OUTERWEAR = "Outerwear"
    FOOTWEAR = "Footwear"
    ACCESSORIES = "Accessories"
    BAGS = "Bags"
    ELECTRONICS = "Electronics"
    OTHERS = "Others"


class Slot(str, Enum):
    """Which position an item occupies in a daily outfit.

    `NONE` covers everything that isn't wearable (electronics, most bags kept
    as inventory rather than styling pieces). Items with `NONE` never appear in
    the Daily Outfit carousels.
    """

    TOP = "top"
    BOTTOM = "bottom"
    OUTERWEAR = "outerwear"
    FOOTWEAR = "footwear"
    ACCESSORY = "accessory"
    NONE = "none"


#: Fallback slot for a category, used when the model omits or invents a slot.
CATEGORY_DEFAULT_SLOT: dict[Category, Slot] = {
    Category.TOPS: Slot.TOP,
    Category.BOTTOMS: Slot.BOTTOM,
    Category.OUTERWEAR: Slot.OUTERWEAR,
    Category.FOOTWEAR: Slot.FOOTWEAR,
    Category.ACCESSORIES: Slot.ACCESSORY,
    Category.BAGS: Slot.ACCESSORY,
    Category.ELECTRONICS: Slot.NONE,
    Category.OTHERS: Slot.NONE,
}


class Label(BaseModel):
    """What the vision model inferred about a photographed item."""

    name: str = Field(description="Short lowercase noun phrase, e.g. 'game controller'")
    category: Category
    slot: Slot
    dominant_color: str = Field(description="Plain colour name, e.g. 'navy'")
    confidence: float = Field(ge=0.0, le=1.0)


class ProcessResponse(BaseModel):
    """Result of POST /v1/process."""

    cutout_png_b64: str
    width: int
    height: int
    name: str
    category: Category
    slot: Slot
    dominant_color: str
    confidence: float
    ms: int


class WardrobeItem(BaseModel):
    """One item as the app knows it, sent when asking for an outfit."""

    id: str
    name: str
    category: Category
    slot: Slot
    dominant_color: str = ""
    times_worn: int = 0


class SuggestRequest(BaseModel):
    items: list[WardrobeItem]
    occasion: str | None = Field(
        default=None, description="Free text, e.g. 'dinner', 'gym', 'office'"
    )
    weather: str | None = Field(default=None, description="e.g. '12C, raining'")
    exclude_item_ids: list[str] = Field(
        default_factory=list,
        description="Items to avoid, so 'shuffle' returns something new.",
    )


class SuggestResponse(BaseModel):
    #: Slot -> item id. Slots the stylist chose to leave empty are omitted.
    picks: dict[Slot, str]
    rationale: str
    ms: int
