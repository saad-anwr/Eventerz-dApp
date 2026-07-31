/**
 * Wallet + identity state.
 *
 * The store never talks to Solana directly - it calls `walletService`, which
 * resolves to the mock or real adapter. That keeps this file identical whether
 * or not Mobile Wallet Adapter is installed.
 */

import { create } from 'zustand';

import { userRepository } from '@/repositories';
import { AnalyticsEvent, analytics, walletService } from '@/services';
import type {
  User,
  WalletAccount,
  WalletConnectionStatus,
  WalletId,
} from '@/types';

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
      const user = await userRepository.ensureWalletUser(account.address);
      set({ status: 'connected', account, user });
      analytics.identify(user.id, { walletId, cluster: account.cluster });
      analytics.track(AnalyticsEvent.WalletConnected, { walletId });
      // Balance is decorative - never let it block the connected state.
      void get().refreshBalance();
    } catch (error) {
      set({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'We could not connect that wallet.',
      });
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
      const user = await userRepository.ensureWalletUser(account.address);
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
      set({ user: await userRepository.ensureWalletUser(account.address) });
    } catch {
      // Keep whatever identity is on screen. A failed re-resolve is not worth
      // blanking the profile the user is looking at.
    }
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

/* -------------------------------------------------------------------------- */
/*  Selectors - keep components subscribed to the narrowest slice possible.    */
/* -------------------------------------------------------------------------- */

export const selectIsConnected = (s: WalletState) => s.status === 'connected';
export const selectAddress = (s: WalletState) => s.account?.address ?? null;
export const selectUserId = (s: WalletState) => s.user?.id ?? null;
