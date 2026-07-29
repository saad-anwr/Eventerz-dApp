/**
 * Push notification seam.
 *
 * Deliberately dependency-free today — `expo-notifications` is not installed,
 * so nothing here asks for a permission the app cannot honour.
 *
 * TODO(push): `npx expo install expo-notifications expo-device`, then
 *   1. request permissions on first RSVP (not at launch — it converts badly),
 *   2. register the Expo push token against the connected wallet address,
 *   3. schedule local reminders 24h and 1h before each RSVP'd event.
 */

import { featureFlags } from '@/constants/config';
import type { EventItem } from '@/types';

export const notificationService = {
  get isEnabled(): boolean {
    return featureFlags.enablePushNotifications;
  },

  async requestPermissions(): Promise<boolean> {
    if (!featureFlags.enablePushNotifications) return false;
    // TODO(push): Notifications.requestPermissionsAsync()
    return false;
  },

  async registerPushToken(_walletAddress: string): Promise<string | null> {
    if (!featureFlags.enablePushNotifications) return null;
    // TODO(push): Notifications.getExpoPushTokenAsync()
    return null;
  },

  /** Schedule 24h + 1h reminders for an event the user RSVP'd to. */
  async scheduleEventReminders(_event: EventItem): Promise<void> {
    if (!featureFlags.enablePushNotifications) return;
    // TODO(push): Notifications.scheduleNotificationAsync(...) × 2
  },

  async cancelEventReminders(_eventId: string): Promise<void> {
    if (!featureFlags.enablePushNotifications) return;
    // TODO(push): cancel by identifier
  },
};
