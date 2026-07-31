/**
 * True when animations should be minimised - either the OS setting is on or
 * the user turned motion down in Settings.
 *
 * Every decorative animation in the app checks this; functional transitions
 * (screen pushes) keep running so navigation never feels broken.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { usePreferencesStore } from '@/store/preferences-store';

export function useReducedMotion(): boolean {
  const preference = usePreferencesStore((s) => s.reduceMotion);
  const [systemSetting, setSystemSetting] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setSystemSetting(enabled);
      })
      .catch(() => {
        // Unsupported platform - leave animations on.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setSystemSetting(enabled),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return preference || systemSetting;
}
