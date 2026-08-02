/**
 * User preferences - persisted to AsyncStorage.
 *
 * `language` was stored and never read: the Settings screen was its only
 * consumer, highlighting whichever chip you had picked while nothing on screen
 * changed. It is live now, driving the runtime translation in `i18n/`.
 *
 * There is deliberately no `theme`. Eventerz is dark-only - the palette, the
 * gradients and the glass surfaces are all designed against a near-black page -
 * and a stored preference nothing honours is worse than no preference at all,
 * which is exactly what the old `theme` field was.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { StorageKeys } from '@/constants/storage-keys';
import { setHapticsEnabled, zustandStorage } from '@/utils';

/*
 * The catalogue moved to `i18n/languages`, which carries ~46 languages rather
 * than 5 and is searchable. Re-exported so existing imports keep working.
 */
export { LANGUAGES, type LanguageCode } from '@/i18n/languages';

interface PreferencesState {
  hasHydrated: boolean;
  onboardingComplete: boolean;
  language: string;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  notifications: {
    eventReminders: boolean;
    walletUpdates: boolean;
    communityAnnouncements: boolean;
    productUpdates: boolean;
  };
  privacy: {
    showWalletOnProfile: boolean;
    discoverable: boolean;
    shareAttendance: boolean;
  };

  setHasHydrated: (v: boolean) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setLanguage: (language: string) => void;
  setHaptics: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  toggleNotification: (key: keyof PreferencesState['notifications']) => void;
  togglePrivacy: (key: keyof PreferencesState['privacy']) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      onboardingComplete: false,
      language: 'en',
      hapticsEnabled: true,
      reduceMotion: false,
      notifications: {
        eventReminders: true,
        walletUpdates: true,
        communityAnnouncements: true,
        productUpdates: false,
      },
      privacy: {
        showWalletOnProfile: true,
        discoverable: true,
        shareAttendance: true,
      },

      setHasHydrated: (v) => set({ hasHydrated: v }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () => set({ onboardingComplete: false }),
      setLanguage: (language) => set({ language }),
      setHaptics: (hapticsEnabled) => {
        setHapticsEnabled(hapticsEnabled);
        set({ hapticsEnabled });
      },
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      toggleNotification: (key) =>
        set({
          notifications: {
            ...get().notifications,
            [key]: !get().notifications[key],
          },
        }),
      togglePrivacy: (key) =>
        set({
          privacy: { ...get().privacy, [key]: !get().privacy[key] },
        }),
    }),
    {
      name: StorageKeys.PREFERENCES,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      onRehydrateStorage: () => (state) => {
        // Push the restored value into the haptics module before any UI runs.
        setHapticsEnabled(state?.hapticsEnabled ?? true);
        state?.setHasHydrated(true);
      },
    },
  ),
);
