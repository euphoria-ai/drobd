/**
 * Icon set.
 *
 * Hand-drawn on a 24px grid rather than pulled from an icon font. A stock set
 * brings its own visual voice -- rounded caps, chunky weights -- that fights the
 * spare look this app is going for. These are all uniform-stroke outlines with
 * no fills, so they sit quietly next to the type.
 */

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme';

export type IconName =
  | 'home'
  | 'shirt'
  | 'archive'
  | 'settings'
  | 'plus'
  | 'search'
  | 'camera'
  | 'image'
  | 'close'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'sparkle'
  | 'shuffle'
  | 'trash'
  | 'minus';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <Path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  shirt: <Path d="M8.5 3 12 5.5 15.5 3 21 6.5 18.5 10 17 9v11H7V9l-1.5 1L3 6.5 8.5 3Z" />,
  archive: <Path d="M3 7h18v3H3V7Zm1.5 3v10h15V10M9.5 14h5" />,
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="m16 16 4.5 4.5" />
    </>
  ),
  camera: (
    <>
      <Path d="M3 8h4l1.5-2.5h7L17 8h4v12H3V8Z" />
      <Circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <Path d="M3 5h18v14H3V5Zm0 11 5-5 4 4 3-3 6 6" />
      <Circle cx="8.5" cy="9" r="1.5" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  check: <Path d="m5 13 4.5 4.5L19 7" />,
  chevronRight: <Path d="m9.5 5 7 7-7 7" />,
  chevronLeft: <Path d="m14.5 5-7 7 7 7" />,
  // Four-point star: reads as "AI" without borrowing a wand or a robot.
  sparkle: <Path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6Z" />,
  shuffle: <Path d="M3 7h4l10 10h4M3 17h4L17 7h4m0 0-3-3m3 3-3 3m3 10-3-3m3 3-3 3" />,
  trash: <Path d="M4 7h16M9 7V4h6v3m-8 0v13h10V7M10 11v5M14 11v5" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Palette token or explicit colour. Defaults to the primary text colour. */
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 1.6 }: IconProps) {
  const theme = useTheme();
  const resolved =
    color && color in theme.colors
      ? (theme.colors[color as keyof typeof theme.colors] as string)
      : (color ?? theme.colors.text);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={resolved}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </Svg>
  );
}
