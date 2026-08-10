import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { itemKeys } from '../../data/items';
import { DEFAULT_DISPLAY_NAME, useDisplayName, useSetDisplayName } from '../../data/profile';
import { clearStrokeCache } from '../../features/pile/strokeCache';
import { checkHealth } from '../../lib/api';
import { cacheSizeBytes, clearCache } from '../../lib/imageCache';
import { supabase } from '../../lib/supabase';
import { useTheme, useThemePreference, type ThemePreference } from '../../theme';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/Pressable';
import { Screen, ScreenTitle, SectionLabel } from '../../ui/Screen';
import { Text } from '../../ui/Text';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { preference, setPreference } = useThemePreference();

  const { data: displayName } = useDisplayName();
  const setDisplayName = useSetDisplayName();

  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const [cacheMb, setCacheMb] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [nameDraft, setNameDraft] = useState('');

  // Seed the field from the stored name, leaving it blank for the placeholder
  // default so the greeting can be personalised from empty.
  useEffect(() => {
    if (displayName && displayName !== DEFAULT_DISPLAY_NAME) setNameDraft(displayName);
  }, [displayName]);

  useEffect(() => {
    checkHealth().then(setServerUp);
    setCacheMb(cacheSizeBytes() / (1024 * 1024));

    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      // Supabase marks anonymous users with is_anonymous; fall back to checking
      // for a linked email so this stays right if that field ever moves.
      setIsAnonymous(Boolean(data.user?.is_anonymous ?? !data.user?.email));
    });
  }, []);

  return (
    <Screen>
      <ScreenTitle>Settings</ScreenTitle>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: theme.space.xxl }}>
        <View>
          <SectionLabel>Appearance</SectionLabel>
          <View
            style={{
              flexDirection: 'row',
              gap: theme.space.sm,
              paddingHorizontal: theme.space.xl,
            }}
          >
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <PressableScale
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  scaleTo={0.95}
                  style={{ flex: 1 }}
                >
                  <View
                    style={{
                      paddingVertical: theme.space.md,
                      alignItems: 'center',
                      borderRadius: theme.radius.md,
                      backgroundColor: selected ? theme.colors.accentSurface : theme.colors.surface,
                    }}
                  >
                    <Text variant="small" color={selected ? 'textInverse' : 'text'}>
                      {option.label}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View>
          <SectionLabel>Name</SectionLabel>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onEndEditing={() => setDisplayName.mutate(nameDraft)}
            placeholder="What should we call you?"
            placeholderTextColor={theme.colors.textFaint}
            returnKeyType="done"
            style={{
              marginHorizontal: theme.space.xl,
              paddingHorizontal: theme.space.lg,
              paddingVertical: theme.space.md + 2,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              fontSize: theme.type.body.fontSize,
              letterSpacing: theme.type.body.letterSpacing,
            }}
          />
        </View>

        <View>
          <SectionLabel>Account</SectionLabel>
          <Row
            label={isAnonymous ? 'Anonymous' : 'Linked'}
            value={userId ? `${userId.slice(0, 8)}…` : '—'}
          />
          {isAnonymous ? (
            <Text
              variant="small"
              color="textFaint"
              style={{ paddingHorizontal: theme.space.xl, marginTop: theme.space.sm }}
            >
              Your wardrobe lives on this device&apos;s account. Link an email to keep it if you
              reinstall or switch phones.
            </Text>
          ) : null}
        </View>

        <View>
          <SectionLabel>AI service</SectionLabel>
          <Row
            label="Status"
            value={serverUp === null ? 'Checking…' : serverUp ? 'Reachable' : 'Unreachable'}
          />
          <Row label="URL" value={process.env.EXPO_PUBLIC_API_URL ?? 'not set'} />
          {serverUp === false ? (
            <Text
              variant="small"
              color="textFaint"
              style={{ paddingHorizontal: theme.space.xl, marginTop: theme.space.sm }}
            >
              Browsing still works. Adding items and generating outfits need the service running,
              and EXPO_PUBLIC_API_URL must be your machine&apos;s LAN address rather than localhost.
            </Text>
          ) : null}
        </View>

        <View>
          <SectionLabel>Storage</SectionLabel>
          <Row label="Cutout cache" value={`${cacheMb.toFixed(1)} MB`} />
          <View style={{ paddingHorizontal: theme.space.xl, marginTop: theme.space.md }}>
            <Button
              label="Clear cache"
              variant="ghost"
              onPress={() => {
                clearCache();
                clearStrokeCache();
                setCacheMb(0);
                // Cutouts are re-downloadable, but the in-memory item list still
                // points at now-deleted files, so refetch to re-resolve them.
                queryClient.invalidateQueries({ queryKey: itemKeys.all });
              }}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.space.xl,
        paddingVertical: theme.space.md,
      }}
    >
      <Text variant="body">{label}</Text>
      <Text variant="small" color="textMuted" numberOfLines={1} style={{ maxWidth: '55%' }}>
        {value}
      </Text>
    </View>
  );
}
