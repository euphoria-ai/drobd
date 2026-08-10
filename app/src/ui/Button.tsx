import React from 'react';
import { ActivityIndicator, StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Icon, IconName } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /**
   * `primary` is the single high-contrast fill -- black on white, white on
   * black. There should be at most one on screen at a time.
   */
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth,
  style,
}: ButtonProps) {
  const theme = useTheme();

  const background =
    variant === 'primary'
      ? theme.colors.accentSurface
      : variant === 'secondary'
        ? theme.colors.surface
        : 'transparent';

  const foreground = variant === 'primary' ? theme.colors.textInverse : theme.colors.text;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.97}
      style={[
        {
          backgroundColor: background,
          borderRadius: theme.radius.pill,
          paddingVertical: theme.space.md + 2,
          paddingHorizontal: theme.space.xl,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space.sm,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : (
          icon && <Icon name={icon} size={18} color={foreground} />
        )}
        <Text variant="bodyStrong" color={foreground}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

export interface IconButtonProps {
  name: IconName;
  onPress?: () => void;
  size?: number;
  /** Filled sits on a surface; bare is transparent, for dense headers. */
  variant?: 'filled' | 'bare';
  accessibilityLabel: string;
}

export function IconButton({
  name,
  onPress,
  size = 22,
  variant = 'filled',
  accessibilityLabel,
}: IconButtonProps) {
  const theme = useTheme();
  const box = size + theme.space.lg;

  return (
    <PressableScale onPress={onPress} scaleTo={0.9}>
      <View
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{
          width: box,
          height: box,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: variant === 'filled' ? theme.colors.surface : 'transparent',
        }}
      >
        <Icon name={name} size={size} />
      </View>
    </PressableScale>
  );
}
