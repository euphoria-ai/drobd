/**
 * Item vocabulary.
 *
 * Mirrors `server/drobe/schemas.py` and the Postgres enums in
 * `supabase/migrations/0001_core_schema.sql`. All three must change together --
 * the server assigns these values, Postgres stores them, and the app filters on
 * them.
 */

export const CATEGORIES = [
  'Tops',
  'Bottoms',
  'Outerwear',
  'Footwear',
  'Accessories',
  'Bags',
  'Electronics',
  'Others',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SLOTS = ['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'none'] as const;

export type Slot = (typeof SLOTS)[number];

/**
 * Slots that make up a daily outfit, in the order they are stacked on the body.
 * `none` is absent on purpose: those items are inventory, not styling pieces.
 */
export const OUTFIT_SLOTS = ['outerwear', 'top', 'bottom', 'footwear', 'accessory'] as const;

export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export const SLOT_LABELS: Record<OutfitSlot, string> = {
  outerwear: 'Outerwear',
  top: 'Top',
  bottom: 'Bottom',
  footwear: 'Shoes',
  accessory: 'Accessory',
};

/** Chip order for the Inventory filter. `All` is prepended by the UI. */
export const CATEGORY_FILTERS = CATEGORIES;

export function isOutfitSlot(slot: Slot): slot is OutfitSlot {
  return slot !== 'none';
}
