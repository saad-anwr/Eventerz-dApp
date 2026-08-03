/**
 * Bottom tab shell.
 *
 * Uses `expo-router/js-tabs` (SDK 57 moved `Tabs` here) with a fully custom bar
 * - see `navigation/tab-bar.tsx`. Screens render their own headers so each can
 * decide whether content bleeds under the status bar.
 */

import Tabs from 'expo-router/js-tabs';

import { EventerzTabBar } from '@/navigation/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <EventerzTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#050816' },
      }}
    >
      {/*
        Five destinations, matching the website's nav exactly. Explore and
        Tickets are routes rather than tabs - see `TABS` in
        `navigation/tab-bar.tsx` for the rule that decides which is which.
      */}
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
