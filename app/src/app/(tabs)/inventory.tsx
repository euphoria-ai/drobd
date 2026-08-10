import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useItems } from '../../data/items';
import { PileCanvas } from '../../features/pile/PileCanvas';
import { CATEGORY_FILTERS, type Category } from '../../lib/taxonomy';
import { useTheme } from '../../theme';
import { IconButton } from '../../ui/Button';
import { ChipRow } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/Pressable';
import { EmptyState, Screen, ScreenTitle } from '../../ui/Screen';
import { Text } from '../../ui/Text';

export default function InventoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useItems();

  const visible = useMemo(() => {
    const all = data ?? [];
    const term = search.trim().toLowerCase();

    return all.filter((item) => {
      if (category && item.category !== category) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        (item.location ?? '').toLowerCase().includes(term) ||
        (item.dominant_color ?? '').toLowerCase().includes(term)
      );
    });
  }, [data, category, search]);

  const hasAnyItems = (data?.length ?? 0) > 0;

  return (
    <Screen>
      <ScreenTitle
        right={
          <IconButton
            name="image"
            accessibilityLabel="Import from photo library"
            onPress={() => router.push('/capture?source=library')}
          />
        }
      >
        Inventory
      </ScreenTitle>

      {hasAnyItems ? (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              marginHorizontal: theme.space.xl,
              marginBottom: theme.space.md,
              paddingHorizontal: theme.space.lg,
              height: 44,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Icon name="search" size={18} color="textFaint" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search items"
              placeholderTextColor={theme.colors.textFaint}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontSize: theme.type.body.fontSize,
                letterSpacing: theme.type.body.letterSpacing,
              }}
            />
            {search.length > 0 ? (
              <PressableScale onPress={() => setSearch('')} scaleTo={0.85}>
                <Icon name="close" size={16} color="textFaint" />
              </PressableScale>
            ) : null}
          </View>

          <ChipRow options={CATEGORY_FILTERS} value={category} onChange={setCategory} />
        </>
      ) : null}

      <View style={{ flex: 1 }}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.textMuted} />
          </View>
        ) : error ? (
          <EmptyState
            title="Couldn't load your items"
            body={error instanceof Error ? error.message : 'Something went wrong.'}
          />
        ) : !hasAnyItems ? (
          <EmptyState
            title="Nothing here yet"
            body="Photograph something you own. drobe cuts it out and files it away."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matches"
            body={
              search
                ? `Nothing matching "${search.trim()}".`
                : `Nothing filed under ${category}.`
            }
          />
        ) : (
          <PileCanvas
            items={visible}
            onSelectItem={(id) => router.push({ pathname: '/item/[id]', params: { id } })}
          />
        )}

        {/* The ground the pile rests on. Drawn behind the tab bar so items
            appear to settle onto the bottom of the screen. */}
        {hasAnyItems && visible.length > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: theme.space.xl,
              right: theme.space.xl,
              bottom: insets.bottom + 76,
              height: 1,
              backgroundColor: theme.colors.ground_line,
            }}
          />
        ) : null}
      </View>

      {hasAnyItems ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: theme.space.xl,
            bottom: insets.bottom + 96,
          }}
        >
          <Text variant="micro" color="textFaint">
            {`${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
