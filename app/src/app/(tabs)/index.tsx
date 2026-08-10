/**
 * Home: what you own, and what you actually wear.
 *
 * Everything here is derived from the items list already in cache, so the tab
 * costs no extra network. The one editorial choice is surfacing never-worn
 * items -- a wardrobe app that only celebrates favourites tells you nothing you
 * didn't know.
 */

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useItems } from '../../data/items';
import { daysAgo } from '../../lib/dates';
import { CATEGORIES } from '../../lib/taxonomy';
import { useTheme } from '../../theme';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/Pressable';
import { EmptyState, Screen, ScreenTitle, SectionLabel } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import type { Item } from '../../types/database';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useItems();
  const items = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const weekAgo = daysAgo(7);

    const byCategory = CATEGORIES.map((category) => ({
      category,
      count: items.filter((item) => item.category === category).length,
    }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);

    const mostWorn = [...items]
      .filter((item) => item.times_worn > 0)
      .sort((a, b) => b.times_worn - a.times_worn)
      .slice(0, 3);

    const neverWorn = items.filter((item) => item.times_worn === 0 && item.slot !== 'none');

    return {
      total: items.length,
      addedThisWeek: items.filter((item) => item.created_at.slice(0, 10) >= weekAgo).length,
      totalWears: items.reduce((sum, item) => sum + item.times_worn, 0),
      byCategory,
      mostWorn,
      neverWorn,
      recent: items.slice(0, 10),
    };
  }, [items]);

  if (isLoading) {
    return (
      <Screen>
        <ScreenTitle>drobe</ScreenTitle>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.textMuted} />
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <ScreenTitle>drobe</ScreenTitle>
        <EmptyState
          title="Your wardrobe, catalogued"
          body="Photograph anything you own. drobe cuts it out, names it, and files it away."
          action={<Button label="Add your first item" icon="camera" onPress={() => router.push('/capture')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>drobe</ScreenTitle>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: theme.space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', paddingHorizontal: theme.space.xl, gap: theme.space.xxxl }}>
          <Stat value={stats.total} label="Items" />
          <Stat value={stats.addedThisWeek} label="Added this week" />
          <Stat value={stats.totalWears} label="Wears logged" />
        </View>

        <View>
          <SectionLabel>Collection</SectionLabel>
          <View style={{ paddingHorizontal: theme.space.xl, gap: theme.space.sm }}>
            {stats.byCategory.map((entry) => (
              <CategoryBar
                key={entry.category}
                label={entry.category}
                count={entry.count}
                max={stats.byCategory[0].count}
              />
            ))}
          </View>
        </View>

        {stats.mostWorn.length > 0 ? (
          <View>
            <SectionLabel>Most worn</SectionLabel>
            <View style={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}>
              {stats.mostWorn.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  detail={`${item.times_worn} ${item.times_worn === 1 ? 'wear' : 'wears'}`}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {stats.neverWorn.length > 0 ? (
          <View>
            <SectionLabel>{`Never worn (${stats.neverWorn.length})`}</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}
            >
              {stats.neverWorn.slice(0, 12).map((item) => (
                <Thumb
                  key={item.id}
                  item={item}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View>
          <SectionLabel>Recently added</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}
          >
            {stats.recent.map((item) => (
              <Thumb
                key={item.id}
                item={item}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="stat">{value}</Text>
      <Text variant="micro" color="textFaint">
        {label}
      </Text>
    </View>
  );
}

/** A bar chart with no axes -- the counts are the labels. */
function CategoryBar({ label, count, max }: { label: string; count: number; max: number }) {
  const theme = useTheme();

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="small">{label}</Text>
        <Text variant="small" color="textFaint">
          {count}
        </Text>
      </View>
      <View
        style={{
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(4, (count / max) * 100)}%`,
            height: '100%',
            backgroundColor: theme.colors.text,
          }}
        />
      </View>
    </View>
  );
}

function ItemRow({
  item,
  detail,
  onPress,
}: {
  item: Item;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <PressableScale onPress={onPress} scaleTo={0.98}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={{ width: 36, height: 36 }} contentFit="contain" />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="micro" color="textFaint">
            {detail}
          </Text>
        </View>
      </View>
    </PressableScale>
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
