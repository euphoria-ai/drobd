/**
 * Daily outfits: what was worn, what is planned, and what the stylist suggests.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { suggestOutfit, type SuggestResult } from '../lib/api';
import type { IsoDate } from '../lib/dates';
import { addDays, startOfWeek, toIsoDate, todayIso } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { OutfitSlot } from '../lib/taxonomy';
import type { Item, OutfitItemRow, OutfitRow } from '../types/database';
import { itemKeys, useItems } from './items';

export const outfitKeys = {
  all: ['outfits'] as const,
  week: (weekStartIso: string) => ['outfits', 'week', weekStartIso] as const,
  range: (startIso: string, days: number) => ['outfits', 'range', startIso, days] as const,
  suggestion: (dateIso: string, weatherLabel: string | null) =>
    ['suggestion', dateIso, weatherLabel] as const,
};

/** A wardrobe needs at least this many slotted items before a suggestion is worth asking for. */
export const MIN_ITEMS_FOR_SUGGESTION = 3;

export interface Outfit {
  id: string;
  forDate: IsoDate | null;
  source: 'ai' | 'manual';
  /** Slot -> item id. */
  picks: Partial<Record<OutfitSlot, string>>;
}

function toOutfit(row: OutfitRow, links: OutfitItemRow[]): Outfit {
  const picks: Partial<Record<OutfitSlot, string>> = {};
  for (const link of links) {
    if (link.slot !== 'none') picks[link.slot as OutfitSlot] = link.item_id;
  }
  return { id: row.id, forDate: row.for_date, source: row.source, picks };
}

/** Outfits for the seven days starting at `weekStart`, keyed by ISO date. */
export function useWeekOutfits(weekStart: Date = startOfWeek()) {
  const startIso = toIsoDate(weekStart);
  const endIso = toIsoDate(addDays(weekStart, 6));

  return useQuery({
    queryKey: outfitKeys.week(startIso),
    queryFn: async (): Promise<Record<IsoDate, Outfit>> => {
      const { data, error } = await supabase
        .from('outfits')
        .select('*, outfit_items(*)')
        .gte('for_date', startIso)
        .lte('for_date', endIso);

      if (error) throw error;

      const byDate: Record<IsoDate, Outfit> = {};
      for (const raw of (data ?? []) as (OutfitRow & { outfit_items: OutfitItemRow[] })[]) {
        if (raw.for_date) {
          byDate[raw.for_date] = toOutfit(raw, raw.outfit_items ?? []);
        }
      }
      return byDate;
    },
    staleTime: 30_000,
  });
}

/**
 * Outfits across an arbitrary span of `days` starting at `start`, keyed by ISO
 * date. The two-week home calendar needs more than the seven days
 * `useWeekOutfits` covers, so this widens the same query.
 */
export function useOutfitsRange(start: Date, days: number) {
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(addDays(start, days - 1));

  return useQuery({
    queryKey: outfitKeys.range(startIso, days),
    queryFn: async (): Promise<Record<IsoDate, Outfit>> => {
      const { data, error } = await supabase
        .from('outfits')
        .select('*, outfit_items(*)')
        .gte('for_date', startIso)
        .lte('for_date', endIso);

      if (error) throw error;

      const byDate: Record<IsoDate, Outfit> = {};
      for (const raw of (data ?? []) as (OutfitRow & { outfit_items: OutfitItemRow[] })[]) {
        if (raw.for_date) {
          byDate[raw.for_date] = toOutfit(raw, raw.outfit_items ?? []);
        }
      }
      return byDate;
    },
    staleTime: 30_000,
  });
}

export interface SaveOutfitInput {
  forDate: IsoDate;
  picks: Partial<Record<OutfitSlot, string>>;
  source: 'ai' | 'manual';
}

/**
 * Save the outfit for a day, replacing whatever was there.
 *
 * A unique index enforces one outfit per day, so this upserts on
 * (user_id, for_date) and then rewrites the slot links wholesale. Diffing the
 * links would be more surgical but there are at most five of them.
 */
export function useSaveOutfit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ forDate, picks, source }: SaveOutfitInput): Promise<Outfit> => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('not signed in');

      const { data: outfit, error: outfitError } = await supabase
        .from('outfits')
        .upsert(
          { user_id: userId, for_date: forDate, source },
          { onConflict: 'user_id,for_date' },
        )
        .select()
        .single();

      if (outfitError || !outfit) throw outfitError ?? new Error('could not save outfit');

      const row = outfit as OutfitRow;
      await supabase.from('outfit_items').delete().eq('outfit_id', row.id);

      const links = Object.entries(picks)
        .filter(([, itemId]) => Boolean(itemId))
        .map(([slot, itemId], index) => ({
          outfit_id: row.id,
          item_id: itemId as string,
          slot: slot as OutfitSlot,
          position: index,
        }));

      if (links.length > 0) {
        const { error: linkError } = await supabase.from('outfit_items').insert(links);
        if (linkError) throw linkError;
      }

      return toOutfit(row, links as OutfitItemRow[]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outfitKeys.all });
    },
  });
}

/**
 * Record that an outfit was actually worn.
 *
 * A database trigger keeps `items.times_worn` and `last_worn_at` in step, so
 * the item list is invalidated afterwards to pick those up. A unique index on
 * (user_id, item_id, worn_on) makes this idempotent -- tapping "wore this"
 * twice in a day does not double anyone's count.
 */
export function useWearOutfit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      outfitId,
      itemIds,
      wornOn,
    }: {
      outfitId: string | null;
      itemIds: string[];
      wornOn: IsoDate;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('not signed in');
      if (itemIds.length === 0) return;

      const { error } = await supabase.from('wear_log').upsert(
        itemIds.map((itemId) => ({
          user_id: userId,
          item_id: itemId,
          outfit_id: outfitId,
          worn_on: wornOn,
        })),
        { onConflict: 'user_id,item_id,worn_on', ignoreDuplicates: true },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemKeys.all });
      queryClient.invalidateQueries({ queryKey: outfitKeys.all });
    },
  });
}

/** Ask the stylist for picks. Returns slot -> item id. */
export function useSuggestOutfit() {
  return useMutation({
    mutationFn: async ({
      items,
      occasion,
      weather,
      excludeItemIds,
    }: {
      items: Item[];
      occasion?: string;
      /**
       * The stylist prompt uses this, but nothing in the app sources it yet --
       * there is no location or forecast provider. Plumbed through so a caller
       * that gains one does not have to reach past this hook.
       */
      weather?: string;
      excludeItemIds?: string[];
    }) => {
      return suggestOutfit({
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          slot: item.slot,
          dominant_color: item.dominant_color ?? '',
          times_worn: item.times_worn,
        })),
        occasion,
        weather,
        excludeItemIds,
      });
    },
  });
}

/**
 * A once-a-day stylist suggestion for the home screen.
 *
 * `useSuggestOutfit` is a mutation, fired by the user on the Outfit tab. The
 * home card instead wants a passive, cacheable pick that refreshes at most
 * daily, so this wraps the same API in a query keyed by the day (and the
 * weather that shaped it). It reads the wardrobe from the shared items cache and
 * only runs once there are enough slotted items to dress from.
 */
export function useDailySuggestion(weatherLabel?: string) {
  const { data: items } = useItems();
  const wardrobe = (items ?? []).filter((item) => item.slot !== 'none');
  const hasEnough = wardrobe.length >= MIN_ITEMS_FOR_SUGGESTION;

  return useQuery<SuggestResult>({
    queryKey: outfitKeys.suggestion(todayIso(), weatherLabel ?? null),
    queryFn: () =>
      suggestOutfit({
        items: wardrobe.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          slot: item.slot,
          dominant_color: item.dominant_color ?? '',
          times_worn: item.times_worn,
        })),
        weather: weatherLabel,
      }),
    enabled: hasEnough,
    // The key already changes with the day, so a long window just avoids
    // re-asking the stylist on every home visit.
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
}
