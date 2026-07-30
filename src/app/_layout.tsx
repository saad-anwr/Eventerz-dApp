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
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WebFrame } from '@/components/layout/web-frame';
import { ToastHost } from '@/components/ui/toast';
import { useLinkGoogleWallet } from '@/features/wallet/use-link-google-wallet';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { queryClient } from '@/services/query-client';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWalletStore } from '@/store/wallet-store';
import { eventerzNavigationTheme } from '@/theme/navigation-theme';
import { motion } from '@/theme/layout';

const STARTUP_STORAGE_TIMEOUT_MS = 2500;

// Keep the native splash up until the first screen is genuinely ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast refresh) — nothing to do.
});

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
  useLinkGoogleWallet();

  // Stream changes from Postgres so the app stays in step with the website.
  useRealtimeSync();

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
                <Stack.Screen name="settings" />
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
