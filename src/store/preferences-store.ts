/**
 * User preferences - persisted to AsyncStorage.
 *
 * The app is dark-first by design; `theme: 'light'` is accepted and stored but
 * the palette currently renders dark either way. Keeping the field means the
 * Settings screen is honest about what is coming without faking a toggle that
 * does nothing structural.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { StorageKeys } from '@/constants/storage-keys';
import { setHapticsEnabled, zustandStorage } from '@/utils';

export type ThemePreference = 'dark' | 'light' | 'system';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
  { code: 'hi', label: 'हिन्दी' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

interface PreferencesState {
  hasHydrated: boolean;
  onboardingComplete: boolean;
  theme: ThemePreference;
  language: LanguageCode;
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
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguageCode) => void;
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
      theme: 'dark',
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
      setTheme: (theme) => set({ theme }),
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
