/**
 * Google account state.
 *
 * Deliberately separate from `walletStore`: the wallet is the primary identity
 * and must keep working with no backend at all. This store layers a real Google
 * account on top for recovery and cross-device profile sync, and is inert when
 * Supabase is not configured.
 */

import { create } from 'zustand';

import {
  getMyProfile,
  getSession,
  isSupabaseConfigured,
  linkWallet as linkWalletRemote,
  signInWithGoogle as startGoogleOAuth,
  signOut as signOutRemote,
  updateMyProfile,
  type ProfileRow,
  type ProfileUpdate,
} from '@/services/auth';
import { AnalyticsEvent, analytics } from '@/services/analytics-service';

export type GoogleLinkStatus = 'idle' | 'linking' | 'linked' | 'error';

interface AuthState {
  /** True when a Supabase project is configured. */
  isLive: boolean;
  status: GoogleLinkStatus;
  profile: ProfileRow | null;
  error: string | null;
  /** True until the persisted session has been checked once. */
  isRestoring: boolean;

  restore: () => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Bind a wallet address to the signed-in Google account. */
  linkWallet: (address: string) => Promise<boolean>;
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isLive: isSupabaseConfigured,
  status: 'idle',
  profile: null,
  error: null,
  isRestoring: isSupabaseConfigured,

  restore: async () => {
    if (!isSupabaseConfigured) {
      set({ isRestoring: false });
      return;
    }
    try {
      const session = await getSession();
      if (!session) {
        set({ isRestoring: false, status: 'idle' });
        return;
      }
      const profile = await getMyProfile();
      set({ profile, status: 'linked', isRestoring: false });
    } catch {
      // A failed restore just means signed-out; never surface it.
      set({ isRestoring: false });
    }
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      set({
        status: 'error',
        error:
          'Google sign-in is not configured yet. See docs/AUTH_SETUP.md.',
      });
      return false;
    }

    set({ status: 'linking', error: null });
    const result = await startGoogleOAuth();

    if (!result.ok) {
      // Backing out of the browser is not an error worth shouting about.
      set({
        status: result.cancelled ? 'idle' : 'error',
        error: result.cancelled ? null : result.error,
      });
      return false;
    }

    set({ profile: result.data, status: 'linked', error: null });
    analytics.track(AnalyticsEvent.GoogleLinked, {
      hasWallet: Boolean(result.data?.wallet_address),
    });
    return true;
  },

  signOut: async () => {
    await signOutRemote();
    set({ profile: null, status: 'idle', error: null });
  },

  linkWallet: async (address) => {
    if (!isSupabaseConfigured || !get().profile) return false;

    const result = await linkWalletRemote(address);
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    set({ profile: result.data, error: null });
    return true;
  },

  updateProfile: async (patch) => {
    if (!isSupabaseConfigured || !get().profile) return;

    const previous = get().profile;
    // Optimistic — the profile editor should feel instant.
    set({ profile: previous ? { ...previous, ...patch } : previous });

    const result = await updateMyProfile(patch);
    if (result.ok) set({ profile: result.data });
    else set({ profile: previous, error: result.error });
  },

  clearError: () => set({ error: null }),
}));

/* -------------------------------------------------------------------------- */
/*  Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export const selectGoogleLinked = (s: AuthState) => s.status === 'linked';
export const selectGoogleEmail = (s: AuthState) => s.profile?.email ?? null;
