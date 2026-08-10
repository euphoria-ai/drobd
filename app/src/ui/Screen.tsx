import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { Text } from './Text';

export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: theme.colors.ground }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

export function ScreenTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.space.xl,
        paddingTop: theme.space.sm,
        paddingBottom: theme.space.lg,
      }}
    >
      <Text variant="title">{children}</Text>
      {right}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      variant="micro"
      color="textFaint"
      style={{ paddingHorizontal: theme.space.xl, marginBottom: theme.space.md }}
    >
      {children}
    </Text>
  );
}

/**
 * Empty states carry a lot of weight in a wardrobe app -- a new user sees
 * nothing but these until they photograph something.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.space.xxxl,
        gap: theme.space.md,
      }}
    >
      <Text variant="heading" center>
        {title}
      </Text>
      <Text variant="small" color="textMuted" center>
        {body}
      </Text>
      {action ? <View style={{ marginTop: theme.space.lg }}>{action}</View> : null}
    </View>
  );
}
