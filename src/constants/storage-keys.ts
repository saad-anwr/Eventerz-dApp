/**
 * Every persisted key in one place, so a store rename can never silently
 * orphan a user's data. `SECURE_*` keys go to expo-secure-store (hardware
 * backed); the rest go to AsyncStorage.
 */

export const StorageKeys = {
  /** Zustand-persisted app state (events, users, RSVPs). */
  APP_STATE: 'eventerz.app-state.v1',
  /** Zustand-persisted UI preferences (theme, haptics, language). */
  PREFERENCES: 'eventerz.preferences.v1',
  /** Set once the user finishes or skips onboarding. */
  ONBOARDING_COMPLETE: 'eventerz.onboarding-complete.v1',
  /** Non-sensitive wallet metadata (label, public address, cluster). */
  WALLET_SESSION: 'eventerz.wallet-session.v1',
  /** React Query offline cache. */
  QUERY_CACHE: 'eventerz.query-cache.v1',
} as const;

export const SecureKeys = {
  /** Mobile Wallet Adapter auth token — never leaves secure storage. */
  WALLET_AUTH_TOKEN: 'eventerz.secure.wallet-auth-token',
  /** Reserved for a future session JWT once a backend exists. */
  SESSION_TOKEN: 'eventerz.secure.session-token',
} as const;
