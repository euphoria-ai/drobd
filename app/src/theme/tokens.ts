/**
 * Design tokens.
 *
 * The product is a fashion assistant, so the garments are meant to be the only
 * colour on screen. There is deliberately no brand accent: emphasis comes from
 * contrast, weight and space. Anything that needs to stand out does so by being
 * darker, heavier, or surrounded by more room -- never by being blue.
 *
 * Feature code must not contain hex values. Read from `useTheme()` instead, or
 * the light/dark pair silently drifts.
 */

/** Neutral ramp. 0 is black, 1000 is white; both themes index into it. */
const neutral = {
  0: '#000000',
  50: '#0A0A0A',
  100: '#141414',
  150: '#1C1C1C',
  200: '#262626',
  300: '#3D3D3D',
  400: '#5C5C5C',
  500: '#7A7A7A',
  600: '#999999',
  700: '#B8B8B8',
  800: '#D6D6D6',
  850: '#E4E4E4',
  900: '#F0F0F0',
  950: '#F7F7F7',
  1000: '#FFFFFF',
} as const;

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** Page background. Pure black or pure white -- nothing in between. */
  ground: string;
  /** Raised surfaces: sheets, cards, the tab bar. */
  surface: string;
  /** Pressed/selected fill behind a control. */
  surfaceActive: string;

  text: string;
  textMuted: string;
  /** Metadata and micro-labels. Must still pass contrast at small sizes. */
  textFaint: string;
  /** Text on top of `accentSurface`. */
  textInverse: string;

  /** Hairline dividers. Used sparingly -- prefer space over lines. */
  border: string;
  /** The one high-contrast fill, for primary buttons and the active chip. */
  accentSurface: string;

  /**
   * Colour of the stroke drawn around each cutout so it separates from the
   * ground. White on black; near-black on white, where a pure-white stroke
   * would be invisible. This is why the server never bakes an outline in.
   */
  cutoutStroke: string;
  /**
   * Ambient shadow under a cutout. Carries the separation work in the light
   * theme, where the stroke alone reads as too heavy.
   */
  cutoutShadow: string;

  /** The line the physics pile rests on. */
  ground_line: string;

  danger: string;
}

const light: Palette = {
  ground: neutral[1000],
  surface: neutral[950],
  surfaceActive: neutral[900],

  text: neutral[0],
  textMuted: neutral[400],
  textFaint: neutral[500],
  textInverse: neutral[1000],

  border: neutral[850],
  accentSurface: neutral[0],

  cutoutStroke: neutral[1000],
  cutoutShadow: 'rgba(0,0,0,0.20)',

  ground_line: neutral[850],

  danger: '#C4322B',
};

const dark: Palette = {
  ground: neutral[0],
  surface: neutral[100],
  surfaceActive: neutral[200],

  text: neutral[1000],
  textMuted: neutral[600],
  textFaint: neutral[500],
  textInverse: neutral[0],

  border: neutral[200],
  accentSurface: neutral[1000],

  cutoutStroke: neutral[1000],
  cutoutShadow: 'rgba(0,0,0,0.55)',

  ground_line: neutral[200],

  danger: '#FF6B61',
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/**
 * Stroke width around a cutout, as a fraction of the sprite's longest edge.
 * Proportional rather than fixed so a small sprite in the pile and a large one
 * in the detail sheet read as the same sticker.
 */
export const CUTOUT_STROKE_RATIO = 0.022;

/** 4pt grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Type scale. Large sizes get negative tracking, which is what makes display
 * text read as a fashion masthead rather than a system dialog. Micro-labels get
 * wide positive tracking and uppercase.
 */
export const type = {
  display: { fontSize: 40, lineHeight: 42, letterSpacing: -1.4, fontWeight: '600' },
  title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.9, fontWeight: '600' },
  heading: { fontSize: 20, lineHeight: 24, letterSpacing: -0.4, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 19, letterSpacing: -0.1, fontWeight: '400' },
  /** Uppercase metadata: section headers, stat captions, tab labels. */
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.1, fontWeight: '600' },
  /** Big numerals on the dashboard. Tabular so they don't jitter when counting. */
  stat: { fontSize: 34, lineHeight: 38, letterSpacing: -1.6, fontWeight: '600' },
} as const;

export type TypeToken = keyof typeof type;

/**
 * Motion. Springs only -- a linear curve reads as cheap, and the whole selling
 * point of this app is how it feels to touch. Every one of these is
 * interruptible: a gesture must be able to grab an animation mid-flight.
 */
export const motion = {
  /** Chips, toggles, small state flips. */
  snappy: { damping: 20, stiffness: 320, mass: 0.7 },
  /** Carousel settle after a swipe. */
  carousel: { damping: 24, stiffness: 180, mass: 0.9 },
  /** Sheets and full-screen transitions. */
  sheet: { damping: 28, stiffness: 150, mass: 1 },
  /** Slight overshoot, for the cutout reveal after a successful capture. */
  reveal: { damping: 14, stiffness: 140, mass: 0.9 },
} as const;

export const duration = {
  instant: 120,
  fast: 200,
  medium: 320,
  slow: 520,
} as const;

/** Physics constants for the inventory pile. */
export const pile = {
  /** Fraction of canvas height where the floor sits. */
  groundY: 0.82,
  restitution: 0.15,
  friction: 0.4,
  frictionAir: 0.012,
  /** Above this, older items stop being simulated. Guards frame rate. */
  maxBodies: 150,
  /** Longest edge of a sprite, as a fraction of canvas width. */
  spriteScale: 0.17,
  /** Gap between staggered drops when a category is selected, in ms. */
  dropStaggerMs: 28,
  /** Accelerometer contribution to gravity, clamped to +/- this. */
  tiltGravityMax: 1.0,
  /** Low-pass factor on the accelerometer; lower is smoother but laggier. */
  tiltSmoothing: 0.12,
} as const;
