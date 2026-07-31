/**
 * Haptics wrapper.
 *
 * Every call is fire-and-forget and respects the user's "haptics" preference,
 * so components never need to check the setting or handle unsupported devices.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

/** Wired to the preferences store on app start. */
export function setHapticsEnabled(next: boolean) {
  enabled = next;
}

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(run: () => Promise<unknown>) {
  if (!enabled || !supported) return;
  run().catch(() => {
    // Haptics are decorative - a failure must never surface to the user.
  });
}

export const haptics = {
  /** Button presses, chip toggles, tab switches. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Sheet snap, pull-to-refresh trigger. */
  medium: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Destructive confirmation, long-press. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
  error: () =>
    safe(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
  selection: () => safe(() => Haptics.selectionAsync()),
};
