/**
 * Typographic text.
 *
 * Every string in the app goes through here so the type scale stays enforced.
 * A raw `<Text>` with an inline fontSize is how a design system rots.
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';

import { TypeToken, useTheme } from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  /** Token name from the palette, or an explicit colour for rare one-offs. */
  color?: 'text' | 'textMuted' | 'textFaint' | 'textInverse' | 'danger' | string;
  /** Micro labels are uppercase by convention rather than by content. */
  uppercase?: boolean;
  center?: boolean;
}

export function Text({
  variant = 'body',
  color = 'text',
  uppercase,
  center,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const token = theme.type[variant];

  const resolvedColor =
    color in theme.colors ? theme.colors[color as keyof typeof theme.colors] : color;

  const composed: TextStyle = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    fontWeight: token.fontWeight as TextStyle['fontWeight'],
    color: resolvedColor as string,
    // `micro` is the metadata voice; uppercasing it here keeps call sites from
    // shouting in the source.
    textTransform: uppercase ?? variant === 'micro' ? 'uppercase' : undefined,
    textAlign: center ? 'center' : undefined,
    // Numerals must not jitter while a stat counts up.
    fontVariant: variant === 'stat' ? ['tabular-nums'] : undefined,
  };

  return <RNText {...rest} style={StyleSheet.compose(composed, style)} />;
}
