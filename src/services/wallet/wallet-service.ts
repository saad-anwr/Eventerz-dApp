/**
 * The single entry point screens and stores use for wallet work.
 *
 * Which adapter backs it is decided here and nowhere else - flip
 * `EXPO_PUBLIC_USE_MOCK_WALLET=false` once a dev build has Mobile Wallet
 * Adapter installed and every caller picks up the real implementation.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { featureFlags } from '@/constants/config';
import type { WalletAdapter } from '@/types';

import { MobileWalletAdapter } from './mobile-wallet-adapter';
import { MockWalletAdapter } from './mock-wallet-adapter';

let adapter: WalletAdapter | null = null;

/**
 * Mobile Wallet Adapter is an Android association intent backed by native code.
 * It cannot work on iOS or web at all, and Expo Go does not bundle the native
 * module - so asking for it there would throw on first use rather than at a
 * point we can explain.
 */
export function isMwaAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/** Why the mock is in use, when it is. Surfaced in Settings. */
export function walletAdapterReason(): string | null {
  if (featureFlags.useMockWallet) {
    return 'Demo wallet - set EXPO_PUBLIC_USE_MOCK_WALLET=false to use a real wallet.';
  }
  if (Platform.OS !== 'android') {
    return 'Mobile Wallet Adapter is Android-only; using the demo wallet here.';
  }
  if (!isMwaAvailable()) {
    return 'Expo Go cannot load Mobile Wallet Adapter. Run a development build (npm run android).';
  }
  return null;
}

export function getWalletAdapter(): WalletAdapter {
  if (!adapter) {
    const useReal = !featureFlags.useMockWallet && isMwaAvailable();
    adapter = useReal ? new MobileWalletAdapter() : new MockWalletAdapter();
  }
  return adapter;
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
