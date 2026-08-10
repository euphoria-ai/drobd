/**
 * Daily Outfit.
 *
 * A week strip across the top, a swipeable carousel per slot below it, and one
 * button that asks the stylist. Picks are held locally and only written when
 * the user saves or wears, so swiping through options never touches the network.
 */

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useItemsBySlot } from '../../data/items';
import { useSaveOutfit, useSuggestOutfit, useWearOutfit } from '../../data/outfits';
import { SlotCarousel } from '../../features/outfit/SlotCarousel';
import { buildWeek, formatLongDay, startOfWeek, todayIso, type IsoDate } from '../../lib/dates';
import { OUTFIT_SLOTS, SLOT_LABELS, type OutfitSlot } from '../../lib/taxonomy';
import { useWeekOutfits } from '../../data/outfits';
import { useTheme } from '../../theme';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/Pressable';
import { EmptyState, Screen, ScreenTitle } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import type { Item } from '../../types/database';

type Picks = Partial<Record<OutfitSlot, string | null>>;

export default function OutfitScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const week = useMemo(() => buildWeek(startOfWeek()), []);
  const [selectedDate, setSelectedDate] = useState<IsoDate>(todayIso());
  const [picks, setPicks] = useState<Picks>({});
  const [rationale, setRationale] = useState('');

  const { data: allItems, bySlot, isLoading } = useItemsBySlot();
  const { data: weekOutfits } = useWeekOutfits(startOfWeek());

  const suggest = useSuggestOutfit();
  const saveOutfit = useSaveOutfit();
  const wearOutfit = useWearOutfit();

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of allItems ?? []) map.set(item.id, item);
    return map;
  }, [allItems]);

  // Load whatever is already recorded for the selected day.
  useEffect(() => {
    const existing = weekOutfits?.[selectedDate];
    setPicks(existing ? { ...existing.picks } : {});
    setRationale('');
  }, [selectedDate, weekOutfits]);

  const chosenItemIds = useMemo(
    () => Object.values(picks).filter((id): id is string => Boolean(id)),
    [picks],
  );

  const hasWardrobe = (allItems ?? []).some((item) => item.slot !== 'none');

  const generate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      const result = await suggest.mutateAsync({
        items: (allItems ?? []).filter((item) => item.slot !== 'none'),
        // Re-rolling should not hand back what is already on screen.
        excludeItemIds: chosenItemIds,
      });
      setPicks(result.picks);
      setRationale(result.rationale);
    } catch {
      setRationale("Couldn't reach the stylist. Pick something yourself.");
    }
  };

  const save = async () => {
    await saveOutfit.mutateAsync({
      forDate: selectedDate,
      picks: picks as Partial<Record<OutfitSlot, string>>,
      source: rationale ? 'ai' : 'manual',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const wear = async () => {
    const saved = await saveOutfit.mutateAsync({
      forDate: selectedDate,
      picks: picks as Partial<Record<OutfitSlot, string>>,
      source: rationale ? 'ai' : 'manual',
    });
    await wearOutfit.mutateAsync({
      outfitId: saved.id,
      itemIds: chosenItemIds,
      wornOn: selectedDate,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <Screen>
        <ScreenTitle>Outfit</ScreenTitle>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.textMuted} />
        </View>
      </Screen>
    );
  }

  if (!hasWardrobe) {
    return (
      <Screen>
        <ScreenTitle>Outfit</ScreenTitle>
        <EmptyState
          title="No clothes yet"
          body="Add a few tops, bottoms and shoes from the Inventory tab and drobe can start dressing you."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>Outfit</ScreenTitle>

      <WeekStrip
        week={week}
        selected={selectedDate}
        onSelect={setSelectedDate}
        outfitThumbs={Object.fromEntries(
          Object.entries(weekOutfits ?? {}).map(([date, outfit]) => {
            const firstId = outfit.picks.top ?? outfit.picks.outerwear ?? outfit.picks.bottom;
            return [date, firstId ? (itemsById.get(firstId)?.imageUri ?? null) : null];
          }),
        )}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.space.xl,
          paddingBottom: insets.bottom + 120,
          gap: theme.space.xl,
        }}
      >
        <Text variant="micro" color="textFaint" style={{ paddingHorizontal: theme.space.xl }}>
          {formatLongDay(selectedDate)}
        </Text>

        {OUTFIT_SLOTS.map((slot) => (
          <SlotCarousel
            key={slot}
            label={SLOT_LABELS[slot]}
            items={bySlot.get(slot) ?? []}
            selectedId={picks[slot] ?? null}
            onSelect={(itemId) => setPicks((current) => ({ ...current, [slot]: itemId }))}
          />
        ))}

        {rationale ? (
          <Animated.View entering={FadeIn.duration(theme.duration.fast)}>
            <Text
              variant="small"
              color="textMuted"
              center
              style={{ paddingHorizontal: theme.space.xxxl }}
            >
              {rationale}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: theme.space.xl,
          right: theme.space.xl,
          bottom: insets.bottom + 76,
          flexDirection: 'row',
          gap: theme.space.sm,
        }}
      >
        <Button
          label={suggest.isPending ? 'Thinking' : 'Generate'}
          icon="sparkle"
          variant="ghost"
          loading={suggest.isPending}
          onPress={generate}
          style={{ flex: 1 }}
        />
        <Button
          label="Wear this"
          onPress={wear}
          loading={saveOutfit.isPending || wearOutfit.isPending}
          disabled={chosenItemIds.length === 0}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}

function WeekStrip({
  week,
  selected,
  onSelect,
  outfitThumbs,
}: {
  week: ReturnType<typeof buildWeek>;
  selected: IsoDate;
  onSelect: (iso: IsoDate) => void;
  outfitThumbs: Record<string, string | null>;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: theme.space.xl,
      }}
    >
      {week.map((day) => {
        const isSelected = day.iso === selected;
        const thumb = outfitThumbs[day.iso];

        return (
          <PressableScale key={day.iso} onPress={() => onSelect(day.iso)} scaleTo={0.92}>
            <View style={{ alignItems: 'center', gap: 6, width: 40 }}>
              <Text variant="micro" color={isSelected ? 'text' : 'textFaint'}>
                {day.initial}
              </Text>

              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: theme.colors.surface,
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: theme.colors.text,
                }}
              >
                {thumb ? (
                  <Image
                    source={{ uri: thumb }}
                    style={{ width: 30, height: 30 }}
                    contentFit="contain"
                  />
                ) : (
                  <Text variant="micro" color={day.isToday ? 'text' : 'textFaint'}>
                    {day.dayOfMonth}
                  </Text>
                )}
              </View>

              {/* Today gets a marker even when another day is selected, so the
                  strip never loses its anchor. */}
              <View
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: day.isToday ? theme.colors.text : 'transparent',
                }}
              />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
