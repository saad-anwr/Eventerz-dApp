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
  deleteAccount as deleteAccountRemote,
  getMyProfile,
  getSession,
  isSupabaseConfigured,
  linkWallet as linkWalletRemote,
  myWallets,
  setPrimaryWallet as setPrimaryWalletRemote,
  signInWithGoogle as startGoogleOAuth,
  signOut as signOutRemote,
  unlinkWallet as unlinkWalletRemote,
  updateMyProfile,
  type LinkedWallet,
  type ProfileRow,
  type ProfileUpdate,
} from '@/services/auth';
import { AnalyticsEvent, analytics } from '@/services/analytics-service';
import { walletService } from '@/services/wallet';

export type GoogleLinkStatus =
  | 'idle'
  | 'linking'
  | 'linked'
  | 'deleting'
  | 'error';

interface AuthState {
  /** True when a Supabase project is configured. */
  isLive: boolean;
  status: GoogleLinkStatus;
  profile: ProfileRow | null;
  /**
   * The signed-in user's own Google address, from the session.
   *
   * Not on `profile`: `profiles.email` is not readable by clients (0015),
   * because the table is world-readable and publishing the row published every
   * address held - and the email -> wallet join with it. The session is the one
   * place an address is available, and it only ever contains your own, which is
   * exactly the guarantee wanted here.
   */
  sessionEmail: string | null;
  /**
   * Every wallet linked to this account, primary first.
   *
   * An account holds a set of wallets, not one (migration 0022), so "is this
   * wallet mine?" is a membership test against this list. It used to be
   * `profile.wallet_address === address`, which is only ever true for the
   * primary - so a second linked wallet looked unlinked, and the app kept
   * asking the user to sign a link challenge for a wallet already linked.
   */
  wallets: LinkedWallet[];
  error: string | null;
  /** True until the persisted session has been checked once. */
  isRestoring: boolean;

  restore: () => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Bind a wallet address to the signed-in Google account. */
  linkWallet: (address: string) => Promise<boolean>;
  /** Detach one wallet. Omit the address to detach the primary. */
  unlinkWallet: (address?: string) => Promise<boolean>;
  /** Promote one of the linked wallets to primary. */
  setPrimaryWallet: (address: string) => Promise<boolean>;
  /** Re-read the linked wallet set from the server. */
  refreshWallets: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
  /** Permanently delete the account. Resolves to an error message, or null. */
  deleteAccount: () => Promise<string | null>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isLive: isSupabaseConfigured,
  status: 'idle',
  profile: null,
  sessionEmail: null,
  wallets: [],
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
        set({ isRestoring: false, status: 'idle', wallets: [] });
        return;
      }
      const [profile, wallets] = await Promise.all([
        getMyProfile(),
        myWallets(),
      ]);
      set({
        profile,
        wallets,
        sessionEmail: session.user?.email ?? null,
        status: 'linked',
        isRestoring: false,
      });
    } catch {
      // A failed restore just means signed-out; never surface it.
      set({ isRestoring: false });
    }
  },

  refreshWallets: async () => {
    if (!isSupabaseConfigured || !get().profile) return;
    set({ wallets: await myWallets() });
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      set({
        status: 'error',
        error:
          'Google sign-in is unavailable right now. You can still connect a wallet to continue.',
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

    set({
      profile: result.data,
      wallets: await myWallets(),
      sessionEmail: (await getSession())?.user?.email ?? null,
      status: 'linked',
      error: null,
    });
    analytics.track(AnalyticsEvent.GoogleLinked, {
      hasWallet: Boolean(result.data?.wallet_address),
    });
    return true;
  },

  /**
   * Sign out locally, whatever the server says.
   *
   * The remote call was awaited bare, so anything it threw propagated out and
   * skipped the `set` - leaving somebody who tapped "Sign out" still signed in,
   * with no error shown, as an unhandled rejection from a callback nobody
   * awaits. Signing out is a local decision; revoking the session server-side
   * is the part that can fail, and it must not be able to keep a user in an
   * account they have asked to leave.
   */
  signOut: async () => {
    try {
      await signOutRemote();
    } catch (error) {
      console.warn('[auth] sign out failed', error);
    }
    set({
      profile: null,
      sessionEmail: null,
      wallets: [],
      status: 'idle',
      error: null,
    });
  },

  /**
   * Delete the account, then clear local state.
   *
   * Returns the failure message rather than throwing so the confirmation dialog
   * can keep the user where they are and show why - a half-finished deletion is
   * exactly the moment not to navigate someone away from the screen that
   * explains what happened.
   */
  deleteAccount: async () => {
    if (!isSupabaseConfigured) return 'Accounts are not configured.';

    set({ status: 'deleting', error: null });

    /*
     * Wrapped because the caller cannot recover from a throw. The delete dialog
     * does `setDeleting(true)` -> `await deleteAccount()` -> `setDeleting(false)`,
     * so an exception here skipped the reset and left the dialog spinning on a
     * button that would never come back - with no way to close it and no idea
     * whether the account had been deleted. A message is recoverable; a
     * permanent spinner is not.
     */
    let result: Awaited<ReturnType<typeof deleteAccountRemote>>;
    try {
      result = await deleteAccountRemote();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Your account could not be deleted. Try again.';
      set({ status: 'error', error: message });
      return message;
    }

    if (!result.ok) {
      set({ status: 'error', error: result.error });
      return result.error;
    }

    set({
      profile: null,
      sessionEmail: null,
      wallets: [],
      status: 'idle',
      error: null,
    });
    return null;
  },

  linkWallet: async (address) => {
    if (!isSupabaseConfigured || !get().profile) return false;

    set({ status: 'linking', error: null });

    /*
     * Linking now requires proving the wallet is yours (migration 0011), so this
     * hands the signing step to `walletService` - which resolves to the real MWA
     * adapter or the demo one, exactly as every other on-chain action does.
     */
    const result = await linkWalletRemote(address, (message) =>
      walletService.signMessage(message),
    );

    if (!result.ok) {
      set({ status: 'error', error: result.error });
      return false;
    }
    set({
      profile: result.data,
      wallets: await myWallets(),
      status: 'linked',
      error: null,
    });
    return true;
  },

  unlinkWallet: async (address) => {
    if (!isSupabaseConfigured || !get().profile) return false;

    const result = await unlinkWalletRemote(address);
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    set({ profile: result.data, wallets: await myWallets(), error: null });
    return true;
  },

  setPrimaryWallet: async (address) => {
    if (!isSupabaseConfigured || !get().profile) return false;

    const result = await setPrimaryWalletRemote(address);
    if (!result.ok) {
      set({ error: result.error });
      return false;
    }
    set({ profile: result.data, wallets: await myWallets(), error: null });
    return true;
  },

  updateProfile: async (patch) => {
    if (!isSupabaseConfigured || !get().profile) return;

    const previous = get().profile;
    // Optimistic - the profile editor should feel instant.
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

export const selectGoogleEmail = (s: AuthState) => s.sessionEmail;
