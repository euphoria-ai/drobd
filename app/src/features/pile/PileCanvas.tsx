/**
 * The Inventory pile.
 *
 * matter-js runs on the JS thread and writes every body's transform into a
 * single shared value each frame; Skia reads that on the UI thread. One
 * cross-thread write per frame rather than one per sprite is what keeps the
 * pile at 60fps with a wardrobe-sized item count.
 */

import { Canvas, Group, Image, type SkImage } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '../../theme';
import type { Item } from '../../types/database';
import { PileEngine, STRIDE, type PileBodySpec } from './PileEngine';
import { getStrokedImage } from './strokeCache';
import { useTiltGravity } from './useTilt';

export interface PileCanvasProps {
  items: Item[];
  onSelectItem?: (itemId: string) => void;
}

interface Sprite {
  id: string;
  image: SkImage;
  halfWidth: number;
  halfHeight: number;
}

export function PileCanvas({ items, onSelectItem }: PileCanvasProps) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [sprites, setSprites] = useState<Sprite[]>([]);

  const engineRef = useRef<PileEngine | null>(null);
  const gravity = useTiltGravity(true);

  // Flat [x, y, angle, scale, alpha] per body. Written once per frame from JS,
  // read per sprite on the UI thread.
  const transforms = useSharedValue<number[]>([]);

  if (engineRef.current === null) {
    engineRef.current = new PileEngine();
  }

  useEffect(() => {
    const engine = engineRef.current;
    return () => engine?.destroy();
  }, []);

  useEffect(() => {
    if (size.width > 0) {
      engineRef.current?.setBounds(size);
    }
  }, [size]);

  // Decode and stroke each cutout. Textures are cached, so switching category
  // and switching back is instant; only the theme's stroke colour invalidates.
  useEffect(() => {
    let cancelled = false;

    const withImages = items.filter((item) => item.imageUri);

    Promise.all(
      withImages.map(async (item) => {
        const image = await getStrokedImage(item.imageUri!, theme.colors.cutoutStroke);
        return image ? { item, image } : null;
      }),
    ).then((resolved) => {
      if (cancelled) return;

      const next: Sprite[] = [];
      for (const entry of resolved) {
        if (!entry) continue;
        const aspect = entry.image.width() / entry.image.height();
        next.push({ id: entry.item.id, image: entry.image, halfWidth: aspect, halfHeight: 1 });
      }
      setSprites(next);
    });

    return () => {
      cancelled = true;
    };
  }, [items, theme.colors.cutoutStroke]);

  // Hand the engine the new set, then read back the extents it chose so the
  // renderer draws each sprite at the size its body actually occupies.
  const [extents, setExtents] = useState<{ halfWidth: number; halfHeight: number }[]>([]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || size.width === 0) return;

    const specs: PileBodySpec[] = sprites.map((sprite) => ({
      id: sprite.id,
      aspect: sprite.image.width() / sprite.image.height(),
    }));

    engine.setBodies(specs);
    setExtents(engine.getExtents());
  }, [sprites, size]);

  // The simulation loop. requestAnimationFrame rather than a fixed interval so
  // it throttles with the display and pauses when the screen is off.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || sprites.length === 0) return;

    let frame = 0;
    const buffer = new Float32Array(sprites.length * STRIDE);

    const tick = (now: number) => {
      engine.setGravity(gravity.current.x, gravity.current.y);
      const count = engine.step(buffer, now);

      // One assignment per frame. Reanimated copies the array across, so a
      // plain array is used rather than reusing the Float32Array in place.
      transforms.value = Array.from(buffer.subarray(0, count * STRIDE));

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sprites.length, gravity, transforms]);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const id = engineRef.current?.bodyAt(x, y);
      if (id && onSelectItem) onSelectItem(id);
    },
    [onSelectItem],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((event) => {
        runOnJS(handleTap)(event.x, event.y);
      }),
    [handleTap],
  );

  return (
    <GestureDetector gesture={tap}>
      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize({ width, height });
        }}
      >
        <Canvas style={{ flex: 1 }}>
          {sprites.map((sprite, index) => (
            <PileSprite
              key={sprite.id}
              index={index}
              image={sprite.image}
              halfWidth={extents[index]?.halfWidth ?? 0}
              halfHeight={extents[index]?.halfHeight ?? 0}
              transforms={transforms}
            />
          ))}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

/**
 * One sprite. Reads its slice of the shared transform buffer on the UI thread,
 * so a frame never touches JS.
 */
function PileSprite({
  index,
  image,
  halfWidth,
  halfHeight,
  transforms,
}: {
  index: number;
  image: SkImage;
  halfWidth: number;
  halfHeight: number;
  transforms: { value: number[] };
}) {
  const offset = index * STRIDE;

  const transform = useDerivedValue(() => {
    const data = transforms.value;
    if (offset + STRIDE > data.length) {
      // Body not simulated yet. Park it off-screen rather than at the origin,
      // where it would flash in the top-left corner on the first frame.
      return [{ translateX: -9999 }, { translateY: -9999 }];
    }
    return [
      { translateX: data[offset] },
      { translateY: data[offset + 1] },
      { rotate: data[offset + 2] },
    ];
  }, [offset]);

  const opacity = useDerivedValue(() => {
    const data = transforms.value;
    return offset + STRIDE > data.length ? 0 : data[offset + 4];
  }, [offset]);

  return (
    <Group transform={transform} opacity={opacity}>
      <Image
        image={image}
        // Drawn centred on the body's origin, which is what the rotation above
        // pivots around.
        x={-halfWidth}
        y={-halfHeight}
        width={halfWidth * 2}
        height={halfHeight * 2}
        fit="contain"
      />
    </Group>
  );
}
