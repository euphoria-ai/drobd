/**
 * Sticker outlines, generated on device.
 *
 * The server returns cutouts with clean transparent alpha and no baked stroke,
 * because a white outline is invisible on the light theme and cannot be undone.
 * The stroke is drawn here instead, in whichever colour contrasts with the
 * current ground.
 *
 * It is baked into a texture once per image per theme rather than applied in
 * the render tree. A dilate is a full shader pass; running 150 of them every
 * frame would cost far more than the pile's entire physics budget.
 */

import { BlendMode, Skia, type SkImage } from '@shopify/react-native-skia';

import { CUTOUT_STROKE_RATIO } from '../../theme/tokens';

/** Cache key is image + stroke colour, so a theme flip regenerates cleanly. */
const cache = new Map<string, SkImage>();

function keyFor(uri: string, strokeColor: string): string {
  return `${strokeColor}::${uri}`;
}

async function decode(uri: string): Promise<SkImage | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

/**
 * Draw `source` with a uniform outline and return the composed texture.
 *
 * The stroke comes from dilating the source's alpha and flooding the result
 * with the stroke colour (`SrcIn` keeps the dilated silhouette but replaces
 * every colour), then drawing the original on top. Padding the surface by the
 * stroke width stops the outline being clipped at the sprite's edge.
 */
function addStroke(source: SkImage, strokeColor: string): SkImage | null {
  const width = source.width();
  const height = source.height();

  const radius = Math.max(2, Math.round(Math.max(width, height) * CUTOUT_STROKE_RATIO));
  const pad = radius + 2;

  const surface = Skia.Surface.MakeOffscreen(width + pad * 2, height + pad * 2);
  if (!surface) return null;

  const canvas = surface.getCanvas();

  const strokePaint = Skia.Paint();
  strokePaint.setImageFilter(
    Skia.ImageFilter.MakeColorFilter(
      Skia.ColorFilter.MakeBlend(Skia.Color(strokeColor), BlendMode.SrcIn),
      Skia.ImageFilter.MakeDilate(radius, radius, null),
      null,
    ),
  );

  canvas.drawImage(source, pad, pad, strokePaint);
  canvas.drawImage(source, pad, pad);

  const snapshot = surface.makeImageSnapshot();
  // Detach from the surface so the texture survives after it is disposed.
  return snapshot.makeNonTextureImage();
}

/**
 * Get the stroked texture for a cutout, generating it on first request.
 *
 * Returns null if the image cannot be decoded -- the caller skips that sprite
 * rather than dropping the whole pile.
 */
export async function getStrokedImage(
  uri: string,
  strokeColor: string,
): Promise<SkImage | null> {
  const key = keyFor(uri, strokeColor);
  const cached = cache.get(key);
  if (cached) return cached;

  const source = await decode(uri);
  if (!source) return null;

  const stroked = addStroke(source, strokeColor) ?? source;
  cache.set(key, stroked);
  return stroked;
}

/**
 * Drop textures for every theme other than the one in use.
 *
 * Called after a theme switch. Without this the cache holds two full sets of
 * sprites, which on a large wardrobe is a lot of GPU memory for a variant
 * nobody is looking at.
 */
export function evictOtherThemes(activeStrokeColor: string): void {
  for (const key of [...cache.keys()]) {
    if (!key.startsWith(`${activeStrokeColor}::`)) {
      cache.delete(key);
    }
  }
}

export function clearStrokeCache(): void {
  cache.clear();
}
