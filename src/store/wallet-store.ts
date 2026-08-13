/**
 * Wallet + identity state.
 *
 * The store never talks to Solana directly - it calls `walletService`, which
 * resolves to the mock or real adapter. That keeps this file identical whether
 * or not Mobile Wallet Adapter is installed.
 */

import { create } from 'zustand';

import { userRepository } from '@/repositories';
import { toUser } from '@/repositories/supabase/rows';
import { AnalyticsEvent, analytics, walletService } from '@/services';
import {
  describeWalletError,
  isWalletCancellation,
} from '@/services/wallet/errors';
import { useAuthStore } from '@/store/auth-store';
import type {
  User,
  WalletAccount,
  WalletConnectionStatus,
  WalletId,
} from '@/types';

/**
 * Who the app is, given a connected wallet.
 *
 * # The rule, and the bug that made it necessary
 *
 * **A signed-in Google account always wins.** `connect`, `restore` and
 * `refreshUser` all used to call `ensureWalletUser` and assign the result
 * straight onto `user`, unconditionally. That is fine when nobody is signed in
 * and actively wrong when somebody is: a wallet that has not been linked yet
 * resolves to a provisional `wallet:<address>` identity, so connecting a wallet
 * while signed in *replaced* the real profile with a placeholder.
 *
 * Everything downstream then wrote that placeholder into a uuid column:
 *
 *     Could not publish
 *     invalid input syntax for type uuid: "wallet:CiM2ZRkc..."
 *
 * which is exactly what publishing an event did. It also explains why the
 * failure looked intermittent and why "switching" appeared to cure it -
 * anything that re-ran `AuthIdentityBridge` re-adopted the real profile, until
 * the next wallet event clobbered it again.
 *
 * Reading the auth store here rather than waiting for that bridge is what makes
 * it deterministic: the identity is resolved at the moment the wallet changes,
 * from the account that is signed in at that moment, instead of being assigned
 * twice and depending on which assignment lands last.
 */
async function resolveIdentity(address: string): Promise<User> {
  const profile = useAuthStore.getState().profile;
  if (profile) return toUser(profile);
  return userRepository.ensureWalletUser(address);
}

interface WalletState {
  status: WalletConnectionStatus;
  account: WalletAccount | null;
  user: User | null;
  balanceSol: number | null;
  error: string | null;
  /** True until `restore()` has run once, so the splash gate knows to wait. */
  isRestoring: boolean;

  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  restore: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /**
   * Re-resolve the identity behind the connected wallet.
   *
   * Needed after Google sign-in: until then a wallet with no linked account
   * holds a provisional identity, and signing in is the moment it becomes a
   * real profile row. Without this the app keeps showing the provisional one -
   * a real account on the server and a placeholder on screen.
   */
  refreshUser: () => Promise<void>;
  /**
   * Take a signed-in Supabase profile as the app's identity.
   *
   * The wallet used to be the only thing that could populate `user`, so signing
   * in with Google produced an account on the server and nothing on screen:
   * Profile still offered "Connect wallet", and every write still carried the
   * provisional `wallet:<address>` id - which Postgres rejected outright with
   * `invalid input syntax for type uuid`, killing friend requests and messages.
   *
   * The website never had this problem because its identity *is* the profile
   * row. This is the same rule: a real row always wins over a placeholder.
   */
  adoptProfile: (user: User | null) => void;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  status: 'disconnected',
  account: null,
  user: null,
  balanceSol: null,
  error: null,
  isRestoring: true,

  connect: async (walletId) => {
    set({ status: 'connecting', error: null });
    try {
      const account = await walletService.connect(walletId);
      const user = await resolveIdentity(account.address);
      set({ status: 'connected', account, user });
      /*
       * `account.walletId`, not the `walletId` argument. The argument is the
       * row that was tapped, and Mobile Wallet Adapter does not honour it -
       * Android picks which wallet answers, and the adapter reports which one
       * did. Recording the tapped row would make the wallet breakdown in
       * analytics a record of what people clicked rather than what they use.
       */
      analytics.identify(user.id, {
        walletId: account.walletId,
        cluster: account.cluster,
      });
      analytics.track(AnalyticsEvent.WalletConnected, {
        walletId: account.walletId,
      });
      // Balance is decorative - never let it block the connected state.
      void get().refreshBalance();
    } catch (error) {
      /*
       * Never store a raw exception message.
       *
       * This used to be `error.message`, which the connect sheet then showed
       * verbatim - so users, and a dApp Store reviewer, were shown
       * `java.util.concurrent.CancellationException` and
       * `Cannot read property 'slice' of null` under the heading "Connection
       * failed". See `describeWalletError`.
       *
       * A cancellation is not an error state either. Backing out of the
       * wallet's approval screen should leave the app exactly as it was, so it
       * returns to `disconnected` with nothing to report.
       */
      if (isWalletCancellation(error)) {
        set({ status: 'disconnected', error: null });
        return;
      }

      /*
       * Logged, not shown.
       *
       * A wallet that authorized successfully and then failed inside our own
       * code looked, from outside, exactly like one that never answered:
       * "Connection failed" and nothing else, anywhere. There was no line in
       * logcat either, so diagnosing it on a device meant rebuilding with a
       * print statement. This is that print statement, kept.
       */
      console.warn('[wallet] connect failed', error);
      set({ status: 'error', error: describeWalletError(error) });
    }
  },

  disconnect: async () => {
    await walletService.disconnect();
    set({
      status: 'disconnected',
      account: null,
      user: null,
      balanceSol: null,
      error: null,
    });
    analytics.track(AnalyticsEvent.WalletDisconnected);
  },

  restore: async () => {
    try {
      const account = await walletService.restore();
      if (!account) {
        set({ isRestoring: false });
        return;
      }
      const user = await resolveIdentity(account.address);
      set({ status: 'connected', account, user, isRestoring: false });
      void get().refreshBalance();
    } catch {
      // A failed restore is not an error the user needs to see - they simply
      // land on the signed-out home screen.
      set({ isRestoring: false });
    }
  },

  refreshBalance: async () => {
    const { account } = get();
    if (!account) return;
    try {
      const balanceSol = await walletService.getBalanceSol(account.address);
      set({ balanceSol });
    } catch {
      set({ balanceSol: null });
    }
  },

  refreshUser: async () => {
    const { account } = get();
    if (!account) return;
    try {
      set({ user: await resolveIdentity(account.address) });
    } catch {
      // Keep whatever identity is on screen. A failed re-resolve is not worth
      // blanking the profile the user is looking at.
    }
  },

  adoptProfile: (user) => {
    if (user) {
      set({ user });
      analytics.identify(user.id, { authMethod: user.authMethod });
      return;
    }

    /*
     * Signed out. Fall back to the wallet's own identity if one is still
     * connected rather than blanking it - disconnecting Google should not
     * disconnect the wallet.
     */
    const { account } = get();
    if (!account) {
      set({ user: null });
      return;
    }
    void get().refreshUser();
  },

  updateProfile: async (patch) => {
    const { user } = get();
    if (!user) return;
    // Optimistic - the profile form should feel instant.
    set({ user: { ...user, ...patch } });
    try {
      const saved = await userRepository.update(user.id, patch);
      set({ user: saved });
    } catch {
      set({ user });
    }
  },

  clearError: () => set({ error: null, status: 'disconnected' }),
}));
