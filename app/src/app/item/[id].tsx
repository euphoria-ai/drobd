/**
 * Item detail and edit.
 *
 * Opened by tapping a sprite in the pile. Everything the capture flow guessed is
 * editable here, because the AI is right most of the time and wrong often enough
 * that being stuck with its answer would be worse than not having it.
 *
 * Reads from the cached item list rather than fetching by id. The pile has
 * already loaded every item to render itself, so a round trip would put a
 * spinner in front of data the app is holding.
 */

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useArchiveItem, useItems, useUpdateItem } from '../../data/items';
import { useWearOutfit } from '../../data/outfits';
import { formatLongDay, todayIso } from '../../lib/dates';
import { CATEGORIES, SLOTS, SLOT_LABELS, type Category, type Slot } from '../../lib/taxonomy';
import { useTheme } from '../../theme';
import { Button, IconButton } from '../../ui/Button';
import { ChipRow } from '../../ui/Chip';
import { EmptyState, Screen, SectionLabel } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import type { Item, ItemRow } from '../../types/database';

/** `none` is a real choice here: it takes an item out of the outfit carousels. */
const SLOT_CHIP_LABELS: Record<Slot, string> = { ...SLOT_LABELS, none: 'Not worn' };

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useItems();

  const item = useMemo(() => data?.find((candidate) => candidate.id === id), [data, id]);

  if (isLoading && !item) {
    return (
      <Screen edges={['top']}>
        <Header onClose={() => router.back()} />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen edges={['top']}>
        <Header onClose={() => router.back()} />
        <EmptyState
          title="Item not found"
          body="It may have been removed from another device."
        />
      </Screen>
    );
  }

  // Remount when the item changes so the form state is rebuilt from the row
  // rather than kept from whichever item was open before.
  return <ItemEditor key={item.id} item={item} />;
}

function Header({
  onClose,
  right,
}: {
  onClose: () => void;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.space.lg,
        minHeight: 56,
      }}
    >
      <IconButton name="close" variant="bare" accessibilityLabel="Close" onPress={onClose} />
      {right}
    </View>
  );
}

function ItemEditor({ item }: { item: Item }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const updateItem = useUpdateItem();
  const archiveItem = useArchiveItem();
  const wear = useWearOutfit();

  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<Category>(item.category);
  const [slot, setSlot] = useState<Slot>(item.slot);
  const [quantity, setQuantity] = useState(item.quantity);
  const [location, setLocation] = useState(item.location ?? '');
  const [note, setNote] = useState(item.note ?? '');

  // Only the fields that actually changed are sent, so an accidental open
  // doesn't bump `updated_at` and invalidate the cutout cache for nothing.
  const patch = useMemo(() => {
    const next: Partial<ItemRow> = {};
    const trimmedName = name.trim() || 'item';
    const trimmedLocation = location.trim() || null;
    const trimmedNote = note.trim() || null;

    if (trimmedName !== item.name) next.name = trimmedName;
    if (category !== item.category) next.category = category;
    if (slot !== item.slot) next.slot = slot;
    if (quantity !== item.quantity) next.quantity = quantity;
    if (trimmedLocation !== item.location) next.location = trimmedLocation;
    if (trimmedNote !== item.note) next.note = trimmedNote;
    return next;
  }, [name, category, slot, quantity, location, note, item]);

  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    if (!dirty) return router.back();
    try {
      await updateItem.mutateAsync({ id: item.id, patch });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.back();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const wearToday = async () => {
    try {
      await wear.mutateAsync({ outfitId: null, itemIds: [item.id], wornOn: todayIso() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not log that', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      `Remove ${item.name}?`,
      'It disappears from your inventory. Outfits you have already worn keep it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveItem.mutateAsync(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                () => undefined,
              );
              router.back();
            } catch (error) {
              Alert.alert(
                'Could not remove',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  // Already logged today, so the button would be a no-op thanks to the unique
  // index on (user_id, item_id, worn_on). Say so instead of pretending.
  const wornToday = item.last_worn_at?.slice(0, 10) === todayIso();

  return (
    <Screen edges={['top']}>
      <Header
        onClose={() => router.back()}
        right={
          dirty ? (
            <Button label="Save" loading={updateItem.isPending} onPress={save} />
          ) : (
            <Text variant="micro" color="textFaint" style={{ paddingRight: theme.space.md }}>
              Saved
            </Text>
          )
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          entering={FadeIn.duration(theme.duration.fast)}
          style={{ alignItems: 'center', paddingVertical: theme.space.xl }}
        >
          {item.imageUri ? (
            <Image
              source={{ uri: item.imageUri }}
              style={{ width: 220, height: 220 }}
              contentFit="contain"
              transition={theme.duration.fast}
            />
          ) : (
            <View
              style={{
                width: 220,
                height: 220,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text variant="micro" color="textFaint">
                No image
              </Text>
            </View>
          )}
        </Animated.View>

        <WearStats item={item} />

        <SectionLabel>Name</SectionLabel>
        <Field value={name} onChangeText={setName} placeholder="What is it?" />

        <Spacer />
        <SectionLabel>Category</SectionLabel>
        <ChipRow
          options={CATEGORIES}
          value={category}
          onChange={(next) => next && setCategory(next)}
          allLabel=""
        />

        <Spacer />
        <SectionLabel>Wears as</SectionLabel>
        <ChipRow
          options={SLOTS}
          value={slot}
          onChange={(next) => next && setSlot(next)}
          allLabel=""
          labels={SLOT_CHIP_LABELS}
        />

        <Spacer />
        <SectionLabel>Quantity</SectionLabel>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.xl,
            paddingHorizontal: theme.space.xl,
          }}
        >
          <IconButton
            name="minus"
            accessibilityLabel="Decrease quantity"
            onPress={() => setQuantity((current) => Math.max(1, current - 1))}
          />
          <Text variant="heading">{quantity}</Text>
          <IconButton
            name="plus"
            accessibilityLabel="Increase quantity"
            onPress={() => setQuantity((current) => current + 1)}
          />
        </View>

        <Spacer />
        <SectionLabel>Location</SectionLabel>
        <Field value={location} onChangeText={setLocation} placeholder="Where do you keep it?" />

        <Spacer />
        <SectionLabel>Note</SectionLabel>
        <Field
          value={note}
          onChangeText={setNote}
          placeholder="Anything worth remembering"
          multiline
        />

        <View style={{ height: theme.space.xxxl }} />

        <View style={{ paddingHorizontal: theme.space.xl, gap: theme.space.md }}>
          <Button
            label={wornToday ? 'Worn today' : 'Wore this today'}
            variant="secondary"
            icon={wornToday ? 'check' : 'shirt'}
            fullWidth
            disabled={wornToday || item.slot === 'none'}
            loading={wear.isPending}
            onPress={wearToday}
          />
          <Button
            label="Remove from inventory"
            variant="ghost"
            icon="trash"
            fullWidth
            loading={archiveItem.isPending}
            onPress={confirmRemove}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * The numbers that make the app feel like it is paying attention. "Never worn"
 * is stated outright rather than shown as a zero, because it is the one stat
 * that should prompt an action.
 */
function WearStats({ item }: { item: Item }) {
  const theme = useTheme();

  const entries: { label: string; value: string }[] = [
    {
      label: 'Worn',
      value: item.times_worn === 0 ? 'Never' : `${item.times_worn}×`,
    },
    {
      label: 'Last worn',
      value: item.last_worn_at ? formatLongDay(item.last_worn_at.slice(0, 10)) : '—',
    },
    { label: 'Added', value: formatLongDay(item.created_at.slice(0, 10)) },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: theme.space.xl,
        marginBottom: theme.space.xxl,
        paddingVertical: theme.space.lg,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {entries.map((entry) => (
        <View key={entry.label} style={{ flex: 1, gap: 6 }}>
          <Text variant="micro" color="textFaint">
            {entry.label}
          </Text>
          <Text variant="bodyStrong">{entry.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Spacer() {
  const theme = useTheme();
  return <View style={{ height: theme.space.xl }} />;
}

function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textFaint}
      multiline={multiline}
      style={{
        marginHorizontal: theme.space.xl,
        paddingHorizontal: theme.space.lg,
        paddingVertical: theme.space.md + 2,
        minHeight: multiline ? 88 : undefined,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        fontSize: theme.type.body.fontSize,
        letterSpacing: theme.type.body.letterSpacing,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
