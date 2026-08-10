/**
 * The user's display name, used to personalise the home-screen greeting.
 *
 * Stored locally under `drobe.display-name` so it survives launches without a
 * round-trip, with Supabase user metadata as a fallback source. There is no
 * server write here -- the greeting is cosmetic and the name never needs to
 * leave the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';

const DISPLAY_NAME_KEY = 'drobe.display-name';

/** Shown when no name has been set anywhere. */
export const DEFAULT_DISPLAY_NAME = 'there';

export const profileKeys = {
  displayName: ['profile', 'display-name'] as const,
};

/**
 * Resolve a name to greet by, preferring the locally stored one and falling
 * back to Supabase metadata, then to a friendly default. Never rejects.
 */
export function useDisplayName() {
  return useQuery({
    queryKey: profileKeys.displayName,
    queryFn: async (): Promise<string> => {
      try {
        const stored = await AsyncStorage.getItem(DISPLAY_NAME_KEY);
        if (stored && stored.trim()) return stored.trim();
      } catch {
        // A missing or unreadable name is not worth surfacing.
      }

      try {
        const { data } = await supabase.auth.getUser();
        const meta = data.user?.user_metadata as
          | { name?: string; full_name?: string }
          | undefined;
        const metaName = meta?.name ?? meta?.full_name;
        if (metaName && metaName.trim()) return metaName.trim();
      } catch {
        // Anonymous sessions have no metadata; fall through to the default.
      }

      return DEFAULT_DISPLAY_NAME;
    },
    staleTime: 5 * 60_000,
  });
}

/** Persist (or clear) the greeting name. Empty input removes the stored value. */
export function useSetDisplayName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (trimmed) await AsyncStorage.setItem(DISPLAY_NAME_KEY, trimmed);
      else await AsyncStorage.removeItem(DISPLAY_NAME_KEY);
      return trimmed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.displayName });
    },
  });
}
