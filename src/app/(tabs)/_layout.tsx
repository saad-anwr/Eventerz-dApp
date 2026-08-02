/**
 * Bottom tab shell.
 *
 * Uses `expo-router/js-tabs` (SDK 57 moved `Tabs` here) with a fully custom bar
 * - see `navigation/tab-bar.tsx`. Screens render their own headers so each can
 * decide whether content bleeds under the status bar.
 */

import Tabs from 'expo-router/js-tabs';

import { EventerzTabBar } from '@/navigation/tab-bar';
import { useThemeColors } from '@/theme/theme-provider';

export default function TabsLayout() {
  const themeColors = useThemeColors();
  return (
    <Tabs
      tabBar={(props) => <EventerzTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: themeColors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
