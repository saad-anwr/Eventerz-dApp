/**
 * The single entry point screens and stores use for wallet work.
 *
 * Which adapter backs it is decided here and nowhere else — flip
 * `EXPO_PUBLIC_USE_MOCK_WALLET=false` once a dev build has Mobile Wallet
 * Adapter installed and every caller picks up the real implementation.
 */

import { featureFlags } from '@/constants/config';
import type { WalletAdapter } from '@/types';

import { MobileWalletAdapter } from './mobile-wallet-adapter';
import { MockWalletAdapter } from './mock-wallet-adapter';

let adapter: WalletAdapter | null = null;

export function getWalletAdapter(): WalletAdapter {
  if (!adapter) {
    adapter = featureFlags.useMockWallet
      ? new MockWalletAdapter()
      : new MobileWalletAdapter();
  }
  return adapter;
}

/** Test seam — lets a spec inject a stub without touching env vars. */
export function setWalletAdapter(next: WalletAdapter | null): void {
  adapter = next;
}

export const walletService = {
  listWallets: () => getWalletAdapter().listWallets(),
  connect: (id: Parameters<WalletAdapter['connect']>[0]) =>
    getWalletAdapter().connect(id),
  disconnect: () => getWalletAdapter().disconnect(),
  restore: () => getWalletAdapter().restore(),
  signMessage: (message: string) => getWalletAdapter().signMessage(message),
  signAndSendTransaction: (
    intent: Parameters<WalletAdapter['signAndSendTransaction']>[0],
  ) => getWalletAdapter().signAndSendTransaction(intent),
  getBalanceSol: (address: string) => getWalletAdapter().getBalanceSol(address),
};
