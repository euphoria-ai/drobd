/**
 * Home.
 *
 * A personal starting point rather than a dashboard: a greeting, the outfit the
 * stylist suggests for today (dressed for the local weather), the handful of
 * actions people reach for most, what was added recently, and a two-week
 * calendar of planned outfits. Everything reads from caches the other tabs
 * already fill, plus one soft weather fetch that fails silently.
 */

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useItems } from '../../data/items';
import {
  MIN_ITEMS_FOR_SUGGESTION,
  useDailySuggestion,
  useOutfitsRange,
  type Outfit,
} from '../../data/outfits';
import { useDisplayName } from '../../data/profile';
import { useWeather, type Weather } from '../../data/weather';
import { addDays, buildWeek, startOfWeek, type IsoDate, type WeekDay } from '../../lib/dates';
import type { OutfitSlot } from '../../lib/taxonomy';
import { useTheme } from '../../theme';
import { Button } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/Pressable';
import { EmptyState, Screen, ScreenTitle, SectionLabel } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import type { Item } from '../../types/database';

const BRAND = 'drobd.';

const ACTIONS = [
  { label: 'Camera', icon: 'camera', href: '/capture' },
  { label: 'Album', icon: 'image', href: '/capture?source=library' },
  { label: 'Suggest', icon: 'sparkle', href: '/outfit' },
  { label: 'Wardrobe', icon: 'archive', href: '/inventory' },
] as const satisfies readonly { label: string; icon: IconName; href: string }[];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useItems();
  const items = useMemo(() => data ?? [], [data]);

  const { data: name } = useDisplayName();
  const { data: weather } = useWeather();
  const suggestion = useDailySuggestion(weather?.label);

  const weekStart = useMemo(() => startOfWeek(), []);
  const { data: rangeOutfits } = useOutfitsRange(weekStart, 14);

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const recent = useMemo(() => items.slice(0, 10), [items]);

  const hasEnoughForSuggestion =
    items.filter((item) => item.slot !== 'none').length >= MIN_ITEMS_FOR_SUGGESTION;

  const calendar = useMemo<WeekDay[]>(
    () => [...buildWeek(weekStart), ...buildWeek(addDays(weekStart, 7))],
    [weekStart],
  );

  const openItem = (id: string) => router.push({ pathname: '/item/[id]', params: { id } });
  const openOutfit = () => router.push('/outfit');

  if (isLoading) {
    return (
      <Screen>
        <ScreenTitle>{BRAND}</ScreenTitle>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.textMuted} />
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <ScreenTitle>{BRAND}</ScreenTitle>
        <EmptyState
          title="Your wardrobe, catalogued"
          body="Photograph anything you own. drobd cuts it out, names it, and files it away."
          action={<Button label="Add your first item" icon="camera" onPress={() => router.push('/capture')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>{BRAND}</ScreenTitle>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: theme.space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: theme.space.xl }}>
          <Text variant="display">{`Hello, ${name ?? 'there'}`}</Text>
        </View>

        <View>
          <SectionLabel>Today&apos;s picks</SectionLabel>
          <View style={{ paddingHorizontal: theme.space.xl }}>
            <SuggestionCard
              weather={weather ?? null}
              picks={suggestion.data?.picks}
              isLoading={suggestion.isLoading}
              failed={Boolean(suggestion.error) || (suggestion.isFetched && !suggestion.data)}
              hasEnough={hasEnoughForSuggestion}
              itemsById={itemsById}
              onPress={openOutfit}
            />
          </View>
        </View>

        <View>
          <SectionLabel>Popular features</SectionLabel>
          <View
            style={{
              flexDirection: 'row',
              gap: theme.space.sm,
              paddingHorizontal: theme.space.xl,
            }}
          >
            {ACTIONS.map((action) => (
              <ActionCard
                key={action.label}
                label={action.label}
                icon={action.icon}
                onPress={() => router.push(action.href)}
              />
            ))}
          </View>
        </View>

        <View>
          <SectionLabel>Recently added</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}
          >
            {recent.map((item) => (
              <Thumb key={item.id} item={item} onPress={() => openItem(item.id)} />
            ))}
          </ScrollView>
        </View>

        <View>
          <SectionLabel>Calendar</SectionLabel>
          <CalendarGrid
            days={calendar}
            outfits={rangeOutfits ?? {}}
            itemsById={itemsById}
            onSelectDay={openOutfit}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The stylist's pick for today, framed by the local weather. */
function SuggestionCard({
  weather,
  picks,
  isLoading,
  failed,
  hasEnough,
  itemsById,
  onPress,
}: {
  weather: Weather | null;
  picks: Partial<Record<OutfitSlot, string>> | undefined;
  isLoading: boolean;
  failed: boolean;
  hasEnough: boolean;
  itemsById: Map<string, Item>;
  onPress: () => void;
}) {
  const theme = useTheme();

  const pickedItems = useMemo(() => {
    if (!picks) return [];
    return Object.values(picks)
      .filter((id): id is string => Boolean(id))
      .map((id) => itemsById.get(id))
      .filter((item): item is Item => Boolean(item));
  }, [picks, itemsById]);

  const weatherLine = weather
    ? [weather.condition, weather.tempC != null ? `${weather.tempC}°` : null, weather.city]
        .filter(Boolean)
        .join(' · ')
    : null;

  const showFallback = !hasEnough || (failed && pickedItems.length === 0);

  return (
    <PressableScale onPress={onPress} scaleTo={0.98}>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
          gap: theme.space.md,
        }}
      >
        {weatherLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Icon name="cloud" size={16} color="textFaint" />
            <Text variant="small" color="textMuted">
              {weatherLine}
            </Text>
          </View>
        ) : null}

        {showFallback ? (
          <View style={{ gap: theme.space.md, paddingVertical: theme.space.sm }}>
            <Text variant="small" color="textMuted">
              {hasEnough
                ? "Couldn't reach the stylist just now."
                : 'Add a few more pieces and drobd can dress you.'}
            </Text>
            <Button label="Plan today's outfit" icon="sparkle" variant="ghost" onPress={onPress} />
          </View>
        ) : isLoading && pickedItems.length === 0 ? (
          <View style={{ height: 76, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.textMuted} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            {pickedItems.map((item) => (
              <View
                key={item.id}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.ground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {item.imageUri ? (
                  <Image
                    source={{ uri: item.imageUri }}
                    style={{ width: 52, height: 52 }}
                    contentFit="contain"
                  />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </PressableScale>
  );
}

/** One tappable shortcut in the Popular features row. */
function ActionCard({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: theme.space.sm }}>
        <View
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={24} />
        </View>
        <Text variant="micro" color="textFaint" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Two rows of seven day cells, each showing any outfit planned for that date. */
function CalendarGrid({
  days,
  outfits,
  itemsById,
  onSelectDay,
}: {
  days: WeekDay[];
  outfits: Record<IsoDate, Outfit>;
  itemsById: Map<string, Item>;
  onSelectDay: (iso: IsoDate) => void;
}) {
  const theme = useTheme();

  const rows = [days.slice(0, 7), days.slice(7, 14)];

  return (
    <View style={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {row.map((day) => {
            const outfit = outfits[day.iso];
            const firstId = outfit
              ? (outfit.picks.top ?? outfit.picks.outerwear ?? outfit.picks.bottom)
              : undefined;
            const thumb = firstId ? (itemsById.get(firstId)?.imageUri ?? null) : null;

            return (
              <PressableScale key={day.iso} onPress={() => onSelectDay(day.iso)} scaleTo={0.9}>
                <View style={{ alignItems: 'center', gap: 4, width: 40 }}>
                  <Text variant="micro" color={day.isToday ? 'text' : 'textFaint'}>
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
                      borderWidth: day.isToday ? 1.5 : 0,
                      borderColor: theme.colors.text,
                    }}
                  >
                    {thumb ? (
                      <Image
                        source={{ uri: thumb }}
                        style={{ width: 30, height: 30 }}
                        contentFit="contain"
                      />
                    ) : outfit ? (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.text,
                        }}
                      />
                    ) : (
                      <Text variant="micro" color="textFaint">
                        {day.dayOfMonth}
                      </Text>
                    )}
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Thumb({ item, onPress }: { item: Item; onPress: () => void }) {
  const theme = useTheme();

  return (
    <PressableScale onPress={onPress} scaleTo={0.93}>
      <View style={{ width: 76, gap: 6 }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={{ width: 62, height: 62 }} contentFit="contain" />
          ) : null}
        </View>
        <Text variant="micro" color="textFaint" numberOfLines={1}>
          {item.name}
        </Text>
      </View>
    </PressableScale>
  );
}
