/**
 * Root layout.
 *
 * Owns everything that must exist before any screen renders: the Tailwind
 * stylesheet, fonts, gesture root, safe-area context, React Query, the
 * navigation theme, the toast host, and the wallet session restore.
 *
 * The native splash is held until fonts and preferences have both settled, so
 * the first frame is fully styled rather than flashing system type.
 */

import '@/polyfills';
import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WebFrame } from '@/components/layout/web-frame';
import { ToastHost } from '@/components/ui/toast';
import { useLinkGoogleWallet } from '@/features/wallet/use-link-google-wallet';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { queryClient } from '@/services/query-client';
import { useAuthStore } from '@/store/auth-store';
import { setActiveLanguage } from '@/i18n/translate';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWalletStore } from '@/store/wallet-store';
import { eventerzNavigationTheme } from '@/theme/navigation-theme';
import { motion } from '@/theme/layout';

const STARTUP_STORAGE_TIMEOUT_MS = 2500;

// Keep the native splash up until the first screen is genuinely ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast refresh) - nothing to do.
});

/**
 * Root error boundary.
 *
 * Exported from the root layout, so it catches anything thrown by a screen that
 * does not define its own. Without it a render error takes the app to React
 * Native's red screen in development and to a blank one in a release build,
 * with no way out but force-quitting - which on Android also loses the back
 * stack.
 *
 * `retry` re-mounts the failed segment rather than restarting the app, so a
 * transient failure (a query that raced a sign-out, a malformed row) costs a
 * tap.
 *
 * Deliberately plain: no `Screen`, no theme hooks, no store reads. This renders
 * *because* something below failed, and pulling in the same providers that may
 * have caused it is how an error boundary throws inside itself.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#050816',
        padding: 24,
        gap: 12,
      }}
    >
      <RNText
        style={{
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        Something broke
      </RNText>
      <RNText
        style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 21 }}
      >
        This is our fault, not yours. Trying again usually works.
      </RNText>
      <RNText
        style={{ color: 'rgba(148,163,184,0.65)', fontSize: 11, textAlign: 'center' }}
        numberOfLines={3}
      >
        {error.message}
      </RNText>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={{
          marginTop: 14,
          paddingVertical: 12,
          paddingHorizontal: 26,
          borderRadius: 999,
          backgroundColor: '#9945ff',
        }}
      >
        <RNText style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
          Try again
        </RNText>
      </Pressable>
    </View>
  );
}

/**
 * Holds the Postgres change subscription that keeps this client in step with
 * the website.
 *
 * It has to be its own component rendered *inside* `QueryClientProvider`, not a
 * hook call in `RootLayout`. A hook in a component's body runs before that
 * component's JSX mounts, so calling `useRealtimeSync()` in `RootLayout` put
 * `useQueryClient()` outside the very provider `RootLayout` returns - which
 * throws "No QueryClient set" and takes down the whole tree.
 *
 * Renders nothing; it exists only to own the subscription's lifetime.
 */
function RealtimeBridge() {
  useRealtimeSync();
  return null;
}

/**
 * Keeps the translation layer pointed at the chosen language.
 *
 * Renders nothing. It exists so the language is set - and its cached strings
 * loaded from disk - before any screen asks for a translation, rather than each
 * screen discovering the language for itself.
 */
function LanguageBridge() {
  const language = usePreferencesStore((s) => s.language);

  useEffect(() => {
    setActiveLanguage(language || 'en');
  }, [language]);

  return null;
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const preferencesReady = usePreferencesStore((s) => s.hasHydrated);
  const restoreWallet = useWalletStore((s) => s.restore);
  const restoreAuth = useAuthStore((s) => s.restore);
  const [storageFallbackReady, setStorageFallbackReady] = useState(false);
  const appReady = fontsReady && (preferencesReady || storageFallbackReady);

  useEffect(() => {
    if (preferencesReady) return undefined;

    const timer = setTimeout(
      () => setStorageFallbackReady(true),
      STARTUP_STORAGE_TIMEOUT_MS,
    );

    return () => clearTimeout(timer);
  }, [preferencesReady]);

  // Reconnect a previous wallet session without prompting the user.
  useEffect(() => {
    void restoreWallet();
  }, [restoreWallet]);

  // Restore a linked Google account, if the user has one. No-ops when Supabase
  // is unconfigured, so the demo build pays nothing for this.
  useEffect(() => {
    void restoreAuth();
  }, [restoreAuth]);

  // Keep the Google account and the connected wallet bound to one identity.
  // Safe here: it reads Zustand stores, not React Query.
  useLinkGoogleWallet();

  const onLayoutReady = useCallback(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) {
    // Render the brand background rather than white, so the hand-off from the
    // native splash to the animated one has no flash.
    return <View className="flex-1 bg-brand-bg" />;
  }

  return (
    <GestureHandlerRootView className="flex-1" onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RealtimeBridge />
          <LanguageBridge />
          <ThemeProvider value={eventerzNavigationTheme}>
            <StatusBar style="light" />

            <WebFrame>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#050816' },
                  animation: 'slide_from_right',
                  animationDuration: motion.duration.normal,
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen
                  name="onboarding"
                  options={{ animation: 'fade' }}
                />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />

                {/* Detail routes */}
                <Stack.Screen name="event/[id]" />
                <Stack.Screen name="ticket/[id]" />
                <Stack.Screen name="community/[id]" />
                <Stack.Screen name="user/[id]" />
                <Stack.Screen name="dashboard" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="messages/index" />
                <Stack.Screen name="messages/[id]" />
                <Stack.Screen name="event/edit/[id]" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="friends" />
                {/* OAuth landing. Android delivers the redirect deep link to
                    the app as well as to the browser session, so this route
                    has to exist or a successful sign-in renders the 404. */}
                <Stack.Screen
                  name="auth/callback"
                  options={{ animation: 'fade', gestureEnabled: false }}
                />
                <Stack.Screen name="profile/edit" />

                {/* Modal-style routes */}
                <Stack.Screen
                  name="scan"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </Stack>

              <ToastHost />
            </WebFrame>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
