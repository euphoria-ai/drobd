/**
 * Theme context.
 *
 * Two grounds, black and white, both first-class. The preference is either
 * "follow the system" or an explicit pick, and it persists across launches.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import {
  CUTOUT_STROKE_RATIO,
  ColorScheme,
  Palette,
  duration,
  motion,
  palettes,
  pile,
  radius,
  space,
  type,
} from './tokens';

export * from './tokens';

export type ThemePreference = ColorScheme | 'system';

const STORAGE_KEY = 'drobe.theme-preference';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
  duration: typeof duration;
  pile: typeof pile;
  cutoutStrokeRatio: number;
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** True until the stored preference has been read, to avoid a theme flash. */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palettes[scheme],
    space,
    radius,
    type,
    motion,
    duration,
    pile,
    cutoutStrokeRatio: CUTOUT_STROKE_RATIO,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      // A missing or unreadable preference is not worth surfacing; following
      // the system is a perfectly good answer.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

    return { theme: buildTheme(scheme), preference, setPreference, isLoading };
  }, [preference, systemScheme, setPreference, isLoading]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return context.theme;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside <ThemeProvider>');
  }
  const { preference, setPreference, isLoading } = context;
  return { preference, setPreference, isLoading };
}
