/**
 * Supabase client and anonymous session bootstrap.
 *
 * The app talks to Postgres directly; there is no server in between holding
 * credentials. Row level security is therefore the entire authorization story,
 * and every query below relies on `auth.uid()` matching the row's `user_id`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

import type { Database } from '../types/database';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy app/.env.example to app/.env and fill them in.',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
  auth: {
    // AsyncStorage rather than SecureStore: a Supabase session is routinely
    // larger than SecureStore's 2KB per-entry limit on Android, and silently
    // truncating it logs the user out at random.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No deep-link callback to parse -- sign-in is anonymous.
    detectSessionInUrl: false,
  },
});

/**
 * Ensure there is a session, creating an anonymous one on first launch.
 *
 * Anonymous auth gives a real `auth.uid()` for RLS without a login screen. The
 * account can be upgraded to email later from Settings without losing data,
 * because the user id is preserved when an identity is linked.
 */
export async function ensureSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) {
    return existing.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw error ?? new Error('anonymous sign-in returned no user');
  }
  return data.user.id;
}

export async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  return data.user.id;
}
