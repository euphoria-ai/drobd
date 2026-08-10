/**
 * A horizontally swipeable row of items for one outfit slot.
 *
 * The pan, the decay, the snap and the neighbour falloff all run in worklets on
 * the UI thread. Only two things ever cross to JS: the selection callback after
 * a snap settles, and the haptic tick. That is what lets this stay smooth while
 * the wardrobe query is refetching or a suggestion is in flight.
 */

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '../../theme';
import { motion } from '../../theme/tokens';
import type { Item } from '../../types/database';
import { Text } from '../../ui/Text';

export interface SlotCarouselProps {
  label: string;
  items: Item[];
  /** Currently chosen item id, or null for "leave this slot empty". */
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
  height?: number;
}

export function SlotCarousel({
  label,
  items,
  selectedId,
  onSelect,
  height = 132,
}: SlotCarouselProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const itemWidth = height;
  // Enough room either side that the focused item sits centred.
  const sidePadding = (screenWidth - itemWidth) / 2;

  /**
   * A leading "empty" entry, so skipping a slot is a swipe rather than a
   * separate control. Outerwear in July should be one gesture away.
   */
  const entries = useMemo(() => [null, ...items], [items]);

  const selectedIndex = useMemo(() => {
    const found = entries.findIndex((entry) => (entry?.id ?? null) === selectedId);
    return found >= 0 ? found : 0;
  }, [entries, selectedId]);

  const offset = useSharedValue(-selectedIndex * itemWidth);
  const start = useSharedValue(0);
  const lastTick = useSharedValue(selectedIndex);

  // Follow external changes -- an AI suggestion animates the carousel into
  // place rather than cutting to it, which is what makes "Generate" feel like
  // the app is dressing you rather than repainting.
  useEffect(() => {
    offset.value = withSpring(-selectedIndex * itemWidth, motion.carousel);
    lastTick.value = selectedIndex;
  }, [selectedIndex, itemWidth, offset, lastTick]);

  const commit = useCallback(
    (index: number) => {
      onSelect(entries[index]?.id ?? null);
    },
    [entries, onSelect],
  );

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        // Let the vertical scroll of the page win, or the whole screen locks up.
        .failOffsetY([-12, 12])
        .onBegin(() => {
          start.value = offset.value;
        })
        .onUpdate((event) => {
          const next = start.value + event.translationX;
          const min = -(entries.length - 1) * itemWidth;
          // Rubber-band past the ends instead of stopping dead.
          if (next > 0) offset.value = next * 0.3;
          else if (next < min) offset.value = min + (next - min) * 0.3;
          else offset.value = next;

          const nearest = Math.round(-offset.value / itemWidth);
          if (nearest !== lastTick.value) {
            lastTick.value = nearest;
            runOnJS(tick)();
          }
        })
        .onEnd((event) => {
          // Project where momentum would carry it, then snap to that item.
          const projected = offset.value + event.velocityX * 0.15;
          const index = Math.max(
            0,
            Math.min(entries.length - 1, Math.round(-projected / itemWidth)),
          );

          offset.value = withSpring(-index * itemWidth, {
            ...motion.carousel,
            velocity: event.velocityX,
          });
          runOnJS(commit)(index);
        }),
    [entries.length, itemWidth, offset, start, lastTick, commit, tick],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  if (items.length === 0) {
    return (
      <View style={{ gap: theme.space.sm }}>
        <Text variant="micro" color="textFaint" style={{ paddingHorizontal: theme.space.xl }}>
          {label}
        </Text>
        <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="small" color="textFaint">
            Nothing filed here yet
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space.sm }}>
      <Text variant="micro" color="textFaint" style={{ paddingHorizontal: theme.space.xl }}>
        {label}
      </Text>

      <GestureDetector gesture={pan}>
        <View style={{ height, justifyContent: 'center' }}>
          <Animated.View
            style={[
              { flexDirection: 'row', paddingLeft: sidePadding, paddingRight: sidePadding },
              trackStyle,
            ]}
          >
            {entries.map((entry, index) => (
              <CarouselCell
                key={entry?.id ?? '__empty__'}
                index={index}
                itemWidth={itemWidth}
                offset={offset}
                item={entry}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

function CarouselCell({
  index,
  itemWidth,
  offset,
  item,
}: {
  index: number;
  itemWidth: number;
  offset: { value: number };
  item: Item | null;
}) {
  const theme = useTheme();

  // Distance from centre, in units of one cell.
  const distance = useDerivedValue(() => (-offset.value / itemWidth - index) * -1);

  const style = useAnimatedStyle(() => {
    const d = Math.abs(distance.value);
    return {
      transform: [{ scale: interpolate(d, [0, 1, 2], [1, 0.76, 0.66], 'clamp') }],
      opacity: interpolate(d, [0, 1, 2], [1, 0.45, 0.2], 'clamp'),
    };
  });

  return (
    <Animated.View
      style={[
        { width: itemWidth, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {item?.imageUri ? (
        <Image
          source={{ uri: item.imageUri }}
          style={{ width: itemWidth * 0.86, height: itemWidth * 0.86 }}
          contentFit="contain"
          // Neighbours are already on disk, so they decode ahead of the swipe
          // reaching them and no cell ever flashes empty.
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View
          style={{
            width: itemWidth * 0.7,
            height: itemWidth * 0.7,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" color="textFaint">
            None
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
