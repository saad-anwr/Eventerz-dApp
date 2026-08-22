/**
 * The single entry point screens and stores use for wallet work.
 *
 * Which adapter backs it is decided here and nowhere else - flip
 * `EXPO_PUBLIC_USE_MOCK_WALLET=false` once a dev build has Mobile Wallet
 * Adapter installed and every caller picks up the real implementation.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { featureFlags } from '@/constants';
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

/**
 * Why a real wallet cannot be used, when it cannot. Surfaced in Settings.
 *
 * Written for whoever is reading it on the phone. These strings used to name
 * environment variables and npm scripts - "set EXPO_PUBLIC_USE_MOCK_WALLET=false",
 * "run a development build" - which is an instruction only the person who built
 * the app could follow, in a screen shipped to people who did not. The
 * conditions are all developer-only in practice, but a user-facing string has no
 * way of knowing that, and one leaking into a release makes a finished app read
 * as an unfinished one.
 */
export function walletAdapterReason(): string | null {
  if (featureFlags.useMockWallet) {
    return 'This build uses a practice wallet, so nothing here touches real funds.';
  }
  if (Platform.OS !== 'android') {
    return 'Solana wallet apps connect on Android. A practice wallet is used here instead.';
  }
  if (!isMwaAvailable()) {
    return 'Wallet connections are unavailable in this preview. A practice wallet is used instead.';
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
