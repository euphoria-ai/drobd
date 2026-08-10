/**
 * Category filter chips.
 *
 * Text-first: the active state is carried by weight and colour rather than a
 * filled pill, which keeps the header quiet enough that the pile below stays
 * the thing you look at. The underline is the only decoration, and it slides
 * rather than cutting.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '../theme';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export interface ChipRowProps<T extends string> {
  options: readonly T[];
  value: T | null;
  onChange: (next: T | null) => void;
  /** Label for the "no filter" chip. Omit to remove it. */
  allLabel?: string;
  /**
   * Display text per option, when the stored value isn't presentable. Slots are
   * lowercase identifiers ('footwear'), but the chip should read "Shoes".
   */
  labels?: Partial<Record<T, string>>;
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  allLabel = 'All',
  labels,
}: ChipRowProps<T>) {
  const theme = useTheme();

  const entries: { key: string; label: string; selected: boolean; select: () => void }[] = [
    ...(allLabel
      ? [
          {
            key: '__all__',
            label: allLabel,
            selected: value === null,
            select: () => onChange(null),
          },
        ]
      : []),
    ...options.map((option) => ({
      key: option,
      label: labels?.[option] ?? option,
      selected: value === option,
      select: () => onChange(option),
    })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: theme.space.xl,
        gap: theme.space.xl,
        alignItems: 'center',
      }}
    >
      {entries.map((entry) => (
        <Chip key={entry.key} label={entry.label} selected={entry.selected} onPress={entry.select} />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const progress = useDerivedValue(() => withSpring(selected ? 1 : 0, theme.motion.snappy));

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
    opacity: progress.value,
  }));

  return (
    <PressableScale onPress={onPress} scaleTo={0.94}>
      <View style={{ paddingVertical: theme.space.sm, gap: 6 }}>
        <Text
          variant={selected ? 'bodyStrong' : 'body'}
          color={selected ? 'text' : 'textMuted'}
        >
          {label}
        </Text>
        <Animated.View
          style={[
            {
              height: 1.5,
              borderRadius: 1,
              backgroundColor: theme.colors.text,
            },
            underlineStyle,
          ]}
        />
      </View>
    </PressableScale>
  );
}
