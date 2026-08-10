/**
 * Client for the FastAPI service.
 *
 * The service is stateless and only does AI work, so it is never on the path
 * for reading the wardrobe. If it is down, browsing still works and only
 * adding items and generating outfits degrade -- surface that clearly rather
 * than showing a generic failure.
 */

import { File } from 'expo-file-system';

import type { Category, OutfitSlot, Slot } from './taxonomy';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

/**
 * Segmentation on CPU is slow; a short timeout would fail good requests. The
 * default segmenter (birefnet-general) can take well over a minute on a laptop
 * CPU, and cutting it off there is indistinguishable from the service being
 * down -- which sent a previous debugging session chasing the network.
 */
const PROCESS_TIMEOUT_MS = 120_000;
/**
 * Must stay comfortably above the server's own `request_timeout_s` (45s) for
 * the stylist call, plus room for the network. Below it, a slow but perfectly
 * healthy suggestion is aborted here as a timeout while the server is still
 * about to answer -- the user sees a failure for a request that succeeded.
 */
const SUGGEST_TIMEOUT_MS = 50_000;

export interface ProcessResult {
  cutoutPngBase64: string;
  width: number;
  height: number;
  name: string;
  category: Category;
  slot: Slot;
  dominantColor: string;
  confidence: number;
  ms: number;
}

export interface SuggestResult {
  picks: Partial<Record<OutfitSlot, string>>;
  rationale: string;
  ms: number;
}

/**
 * The underlying failure, but only in development. In production the cause is
 * noise to the user; while developing it is the whole diagnosis, and hiding it
 * is what makes a timeout look like a dead server.
 */
function detail(cause: unknown): string {
  if (!__DEV__) return '';
  const message = cause instanceof Error ? cause.message : cause ? String(cause) : '';
  return message ? ` (${message})` : '';
}

export class ApiUnreachable extends Error {
  constructor(cause?: unknown) {
    super(
      "Can't reach the drobe service. Check it's running and that EXPO_PUBLIC_API_URL points at your machine's LAN address." +
        detail(cause),
    );
    this.name = 'ApiUnreachable';
    this.cause = cause;
  }
}

/**
 * Distinct from ApiUnreachable: the service answered the connection, we just
 * gave up waiting. Same rejection from fetch, completely different fix.
 */
export class ApiTimeout extends Error {
  constructor(
    readonly timeoutMs: number,
    cause?: unknown,
  ) {
    super(
      `The drobe service didn't answer within ${Math.round(timeoutMs / 1000)}s. It may still be warming up its model.` +
        detail(cause),
    );
    this.name = 'ApiTimeout';
    this.cause = cause;
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function requireBaseUrl(): string {
  if (!BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Copy app/.env.example to app/.env.');
  }
  return BASE_URL;
}

/**
 * Every request goes through here so that the two failure modes stay separable.
 * Aborting the fetch makes it reject exactly like a connection failure does, so
 * the only reliable signal is the controller itself.
 */
async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw controller.signal.aborted
      ? new ApiTimeout(timeoutMs, error)
      : new ApiUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    // Not JSON. Fall through to the status text.
  }
  return response.statusText || `request failed with ${response.status}`;
}

/** Segment an item out of a photo and label it. */
export async function processImage(imageUri: string): Promise<ProcessResult> {
  const url = `${requireBaseUrl()}/v1/process`;

  const form = new FormData();
  // Expo's fetch is WinterCG rather than React Native's XHR shim, so the old
  // `{ uri, name, type }` pseudo-file is rejected outright ("Unsupported
  // FormDataPart implementation") and the request never leaves the device. It
  // wants real bytes: expo-file-system's File implements Blob, so it is
  // serialised properly and carries the filename and mime type with it.
  form.append('image', new File(imageUri) as unknown as Blob);

  const response = await request(url, { method: 'POST', body: form }, PROCESS_TIMEOUT_MS);

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  const data = await response.json();
  return {
    cutoutPngBase64: data.cutout_png_b64,
    width: data.width,
    height: data.height,
    name: data.name,
    category: data.category,
    slot: data.slot,
    dominantColor: data.dominant_color ?? '',
    confidence: data.confidence ?? 0,
    ms: data.ms ?? 0,
  };
}

export interface SuggestPayload {
  items: {
    id: string;
    name: string;
    category: Category;
    slot: Slot;
    dominant_color: string;
    times_worn: number;
  }[];
  occasion?: string;
  weather?: string;
  excludeItemIds?: string[];
}

/** Ask the stylist for an outfit built from items the user owns. */
export async function suggestOutfit(payload: SuggestPayload): Promise<SuggestResult> {
  const url = `${requireBaseUrl()}/v1/suggest-outfit`;

  const response = await request(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: payload.items,
        occasion: payload.occasion ?? null,
        weather: payload.weather ?? null,
        exclude_item_ids: payload.excludeItemIds ?? [],
      }),
    },
    SUGGEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  const data = await response.json();
  return { picks: data.picks ?? {}, rationale: data.rationale ?? '', ms: data.ms ?? 0 };
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await request(`${requireBaseUrl()}/healthz`, {}, 5_000);
    return response.ok;
  } catch {
    return false;
  }
}
