/**
 * Database row types.
 *
 * Hand-written to match `supabase/migrations/`. Once the project exists these
 * can be regenerated with the Supabase CLI:
 *
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * These are `type` aliases rather than `interface`s on purpose. supabase-js
 * constrains each schema to `GenericSchema`, whose tables must be assignable to
 * `Record<string, unknown>`. Interfaces have no implicit index signature, so an
 * interface here makes the whole schema resolve to `never` and every insert and
 * update fails to typecheck with a misleading error.
 */

import type { Category, Slot } from '../lib/taxonomy';

export type ItemRow = {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  slot: Slot;
  quantity: number;
  location: string | null;
  note: string | null;
  image_path: string | null;
  width_px: number | null;
  height_px: number | null;
  dominant_color: string | null;
  ai_confidence: number | null;
  times_worn: number;
  last_worn_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type OutfitRow = {
  id: string;
  user_id: string;
  name: string | null;
  for_date: string | null;
  source: 'ai' | 'manual';
  created_at: string;
};

export type OutfitItemRow = {
  outfit_id: string;
  item_id: string;
  slot: Slot;
  position: number;
};

export type WearLogRow = {
  id: string;
  user_id: string;
  item_id: string;
  outfit_id: string | null;
  worn_on: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  created_at: string;
};

/**
 * Inserts omit database-generated columns and treat defaulted ones as optional,
 * which is what makes `.insert()` accept a partial row without casting.
 */
type Table<Row, Generated extends keyof Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Generated | Defaulted> & Partial<Pick<Row, Generated | Defaulted>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'created_at', 'display_name'>;
      items: Table<
        ItemRow,
        'id' | 'created_at' | 'updated_at',
        | 'name'
        | 'category'
        | 'slot'
        | 'quantity'
        | 'location'
        | 'note'
        | 'image_path'
        | 'width_px'
        | 'height_px'
        | 'dominant_color'
        | 'ai_confidence'
        | 'times_worn'
        | 'last_worn_at'
        | 'archived_at'
      >;
      outfits: Table<OutfitRow, 'id' | 'created_at', 'name' | 'for_date' | 'source'>;
      outfit_items: Table<OutfitItemRow, never, 'position'>;
      wear_log: Table<WearLogRow, 'id' | 'created_at', 'outfit_id' | 'worn_on'>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      item_category: Category;
      item_slot: Slot;
      outfit_source: 'ai' | 'manual';
    };
    CompositeTypes: Record<string, never>;
  };
};

/** An item plus the resolved local URI of its cutout, as the UI consumes it. */
export type Item = ItemRow & { imageUri: string | null };
