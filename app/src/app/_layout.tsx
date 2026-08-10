import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureSession } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../theme';
import { Text } from '../ui/Text';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // The wardrobe only changes from this device, so aggressive refetching
      // buys nothing and costs battery.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionGate>
              <ThemedStack />
            </SessionGate>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const theme = useTheme();

  return (
    <>
      {/* Icons must invert with the ground, or they vanish into it. */}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.ground },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="capture"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="item/[id]"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

/**
 * Block the first render until there is a session.
 *
 * Sign-in is anonymous and takes one round trip, but every query depends on
 * `auth.uid()`. Rendering the tabs first would fire a burst of queries that all
 * fail RLS and then have to be retried.
 */
function SessionGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    ensureSession()
      .then(() => !cancelled && setState('ready'))
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : String(error));
        setState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'ready') return <>{children}</>;

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.ground,
        paddingHorizontal: theme.space.xxxl,
        gap: theme.space.md,
      }}
    >
      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.textMuted} />
      ) : (
        <>
          <Text variant="heading" center>
            Can&apos;t start
          </Text>
          <Text variant="small" color="textMuted" center>
            {message || 'Sign-in failed.'}
          </Text>
          <Text variant="small" color="textFaint" center>
            Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env, and that
            anonymous sign-ins are enabled for the project.
          </Text>
        </>
      )}
    </View>
  );
}
