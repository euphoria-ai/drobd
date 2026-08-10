/**
 * Wardrobe reads and writes.
 *
 * Items are fetched once and filtered in memory. A wardrobe is a few hundred
 * rows at most, and the Inventory chips, the outfit carousels and the dashboard
 * all slice the same list -- refetching per filter would make chip switching
 * feel networked when it should feel instant.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { base64ToBytes } from '../lib/base64';
import { getCachedCutout, primeCache } from '../lib/imageCache';
import { supabase } from '../lib/supabase';
import type { Category, Slot } from '../lib/taxonomy';
import type { Item, ItemRow } from '../types/database';

const BUCKET = 'cutouts';

export const itemKeys = {
  all: ['items'] as const,
};

async function hydrate(rows: ItemRow[]): Promise<Item[]> {
  // Resolve every cutout in parallel. Each is a local-disk hit after the first
  // launch, so this is fast enough to do eagerly rather than per-sprite.
  const uris = await Promise.all(
    rows.map((row) => (row.image_path ? getCachedCutout(row.image_path, row.updated_at) : null)),
  );
  return rows.map((row, index) => ({ ...row, imageUri: uris[index] }));
}

export function useItems() {
  return useQuery({
    queryKey: itemKeys.all,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return hydrate(data as ItemRow[]);
    },
    staleTime: 30_000,
  });
}

/** Items in a category, or everything when `category` is null ("All"). */
export function useItemsByCategory(category: Category | null) {
  const query = useItems();

  const items = useMemo(() => {
    const all = query.data ?? [];
    return category ? all.filter((item) => item.category === category) : all;
  }, [query.data, category]);

  return { ...query, items };
}

/** Items grouped by outfit slot, least-worn first. Drives the outfit carousels. */
export function useItemsBySlot() {
  const query = useItems();

  const bySlot = useMemo(() => {
    const groups = new Map<Slot, Item[]>();
    for (const item of query.data ?? []) {
      const bucket = groups.get(item.slot);
      if (bucket) bucket.push(item);
      else groups.set(item.slot, [item]);
    }
    // Least-worn first so the carousel opens on something neglected rather
    // than the shirt the user already wears constantly.
    for (const bucket of groups.values()) {
      bucket.sort((a, b) => a.times_worn - b.times_worn);
    }
    return groups;
  }, [query.data]);

  return { ...query, bySlot };
}

export interface NewItem {
  name: string;
  category: Category;
  slot: Slot;
  quantity: number;
  location: string | null;
  note: string | null;
  dominantColor: string;
  confidence: number;
  cutoutPngBase64: string;
  width: number;
  height: number;
}

/**
 * Save a captured item: insert the row, upload its cutout, then point the row
 * at the uploaded file.
 *
 * The row is created first so the storage path can be keyed by item id, which
 * makes the object self-describing and lets the RLS policy match on the user
 * folder alone. If the upload fails the row is removed again -- an item with no
 * image would render as a hole in the pile.
 */
export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewItem): Promise<Item> => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('not signed in');

      const { data: inserted, error: insertError } = await supabase
        .from('items')
        .insert({
          user_id: userId,
          name: input.name,
          category: input.category,
          slot: input.slot,
          quantity: input.quantity,
          location: input.location,
          note: input.note,
          dominant_color: input.dominantColor,
          ai_confidence: input.confidence,
          width_px: input.width,
          height_px: input.height,
        })
        .select()
        .single();

      if (insertError || !inserted) throw insertError ?? new Error('insert failed');

      const row = inserted as ItemRow;
      const storagePath = `${userId}/${row.id}.png`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, base64ToBytes(input.cutoutPngBase64), {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        await supabase.from('items').delete().eq('id', row.id);
        throw uploadError;
      }

      const { data: updated, error: updateError } = await supabase
        .from('items')
        .update({ image_path: storagePath })
        .eq('id', row.id)
        .select()
        .single();

      if (updateError || !updated) throw updateError ?? new Error('could not attach image');

      const finalRow = updated as ItemRow;
      // We already hold the exact bytes, so write them into the cache instead
      // of downloading what we just uploaded.
      const imageUri =
        primeCache(storagePath, input.cutoutPngBase64, finalRow.updated_at) ??
        (await getCachedCutout(storagePath, finalRow.updated_at));

      return { ...finalRow, imageUri };
    },
    onSuccess: (item) => {
      // Prepend rather than refetch so the new item is already in the pile by
      // the time the success screen dismisses.
      queryClient.setQueryData<Item[]>(itemKeys.all, (previous) =>
        previous ? [item, ...previous] : [item],
      );
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ItemRow> }) => {
      const { data, error } = await supabase
        .from('items')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error || !data) throw error ?? new Error('update failed');
      return data as ItemRow;
    },
    onSuccess: (row) => {
      queryClient.setQueryData<Item[]>(itemKeys.all, (previous) =>
        previous?.map((item) => (item.id === row.id ? { ...item, ...row } : item)),
      );
    },
  });
}

/**
 * Archive rather than delete. Outfits worn in the past still reference the
 * item, and a hard delete would blank out history the user cannot get back.
 */
export function useArchiveItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('items')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Item[]>(itemKeys.all, (previous) =>
        previous?.filter((item) => item.id !== id),
      );
    },
  });
}
