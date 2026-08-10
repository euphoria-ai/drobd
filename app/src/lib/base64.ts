/**
 * Base64 <-> bytes.
 *
 * Hand-rolled rather than pulling a dependency: the server returns cutout PNGs
 * as base64, and both Supabase Storage uploads and the filesystem want bytes,
 * so this sits on the hot path of every capture. `Buffer` does not exist in
 * React Native, and `atob` produces a binary string that then has to be walked
 * character by character anyway.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function base64ToBytes(base64: string): Uint8Array {
  // Tolerate data-URL prefixes and whitespace from wrapped payloads.
  const clean = base64.replace(/^data:[^,]+,/, '').replace(/[\s=]/g, '');

  const byteLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let buffer = 0;
  let bitsCollected = 0;
  let written = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = LOOKUP[clean.charCodeAt(i)];
    if (value === 255) continue; // skip anything outside the alphabet

    buffer = (buffer << 6) | value;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[written] = (buffer >> bitsCollected) & 0xff;
      written += 1;
    }
  }

  return written === byteLength ? bytes : bytes.subarray(0, written);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const remaining = bytes.length - i;

    output += ALPHABET[(chunk >> 18) & 63];
    output += ALPHABET[(chunk >> 12) & 63];
    output += remaining > 1 ? ALPHABET[(chunk >> 6) & 63] : '=';
    output += remaining > 2 ? ALPHABET[chunk & 63] : '=';
  }

  return output;
}
