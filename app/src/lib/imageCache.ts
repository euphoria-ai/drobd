/**
 * Local cache for cutout PNGs.
 *
 * The pile renders up to 150 sprites as GPU textures, so they have to come off
 * local disk -- streaming them from Supabase every time the tab mounts would
 * make the pile pop in over several seconds. The `cutouts` bucket is private,
 * so each miss costs a signed URL before the download.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { base64ToBytes } from './base64';
import { supabase } from './supabase';

const BUCKET = 'cutouts';
const CACHE_DIR_NAME = 'drobe-cutouts';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
  // `idempotent` keeps this cheap enough to call on every lookup, which avoids
  // holding a "did we create it yet" flag that goes stale when the OS evicts
  // the cache directory underneath us.
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Storage paths are '<user_id>/<item_id>.png'. Flatten to a single filename so
 * the cache stays one directory deep, and include `updatedAt` so replacing an
 * item's photo busts the entry instead of serving the old cutout forever.
 */
function cacheFileName(storagePath: string, updatedAt?: string | null): string {
  const flat = storagePath.replace(/[^a-zA-Z0-9._-]/g, '_');
  const version = updatedAt ? `-${Date.parse(updatedAt) || 0}` : '';
  return `${flat}${version}.png`;
}

/** Resolve a storage path to a local file URI, downloading it if necessary. */
export async function getCachedCutout(
  storagePath: string,
  updatedAt?: string | null,
): Promise<string | null> {
  try {
    const target = new File(cacheDir(), cacheFileName(storagePath, updatedAt));
    if (target.exists && target.size > 0) {
      return target.uri;
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) return null;

    const downloaded = await File.downloadFileAsync(data.signedUrl, target);
    return downloaded.uri;
  } catch {
    // A cache miss is not worth an error state -- the caller renders a
    // placeholder and the next mount tries again.
    return null;
  }
}

/**
 * Write a freshly-captured cutout straight into the cache.
 *
 * Saves the round trip of uploading and immediately downloading the same bytes,
 * so a new item drops into the pile with its real texture rather than a
 * placeholder that swaps in a second later.
 */
export function primeCache(
  storagePath: string,
  pngBase64: string,
  updatedAt?: string | null,
): string | null {
  try {
    const target = new File(cacheDir(), cacheFileName(storagePath, updatedAt));
    if (target.exists) target.delete();
    target.create();
    target.write(base64ToBytes(pngBase64));
    return target.uri;
  } catch {
    return null;
  }
}

export function clearCache(): void {
  try {
    const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing actionable; the OS reclaims the cache directory anyway.
  }
}

export function cacheSizeBytes(): number {
  try {
    const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
    if (!dir.exists) return 0;
    return dir
      .list()
      .reduce((total, entry) => total + (entry instanceof File ? entry.size : 0), 0);
  } catch {
    return 0;
  }
}
