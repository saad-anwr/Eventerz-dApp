/**
 * Mock wallet adapter - the implementation shipping today.
 *
 * It fabricates a deterministic base58-looking address per wallet, persists the
 * session so a relaunch stays connected, and simulates approval latency so the
 * connect sheet's pending state is exercised for real.
 *
 * It implements exactly the same `WalletAdapter` contract as the future Mobile
 * Wallet Adapter, so swapping is a one-line change in `wallet-service.ts`.
 */

import { integrationsConfig } from '@/constants/config';
import { StorageKeys, SecureKeys } from '@/constants/storage-keys';
import type {
  SignedTransactionResult,
  TransactionIntent,
  WalletAccount,
  WalletAdapter,
  WalletDescriptor,
  WalletId,
} from '@/types';
import { secureStorage, sleep, storage, uid } from '@/utils';

import { SUPPORTED_WALLETS } from './wallets';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Deterministic pseudo-address so the same wallet always looks the same. */
function fakeAddress(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 44; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out += BASE58[h % BASE58.length];
  }
  return out;
}

export class MockWalletAdapter implements WalletAdapter {
  readonly id = 'mock';

  async listWallets(): Promise<WalletDescriptor[]> {
    return SUPPORTED_WALLETS;
  }

  async connect(walletId: WalletId): Promise<WalletAccount> {
    // Approximate the round-trip through a real wallet's approval sheet.
    await sleep(900);

    const descriptor = SUPPORTED_WALLETS.find((w) => w.id === walletId);
    const account: WalletAccount = {
      address: fakeAddress(`${walletId}:eventerz`),
      label: descriptor?.name ?? 'Solana Wallet',
      walletId,
      cluster: integrationsConfig.solanaNetwork,
    };

    await storage.set(StorageKeys.WALLET_SESSION, account);
    // Mirrors how MWA hands back a reusable auth token.
    await secureStorage.set(SecureKeys.WALLET_AUTH_TOKEN, uid('mock_auth'));
    return account;
  }

  async disconnect(): Promise<void> {
    await storage.remove(StorageKeys.WALLET_SESSION);
    await secureStorage.remove(SecureKeys.WALLET_AUTH_TOKEN);
  }

  async restore(): Promise<WalletAccount | null> {
    const [account, token] = await Promise.all([
      storage.get<WalletAccount>(StorageKeys.WALLET_SESSION),
      secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN),
    ]);
    // Both halves must survive - a session without its token is not reusable.
    if (!account || !token) return null;
    return account;
  }

  async signMessage(message: string): Promise<string> {
    await sleep(600);
    return `mock_sig_${fakeAddress(message).slice(0, 32)}`;
  }

  async signAndSendTransaction(
    intent: TransactionIntent,
  ): Promise<SignedTransactionResult> {
    await sleep(1100);
    return { signature: `mock_tx_${fakeAddress(JSON.stringify(intent))}` };
  }

  async getBalanceSol(address: string): Promise<number> {
    await sleep(400);
    // Stable per-address balance so the profile header does not flicker.
    const n = Number(`0.${fakeAddress(address).replace(/\D/g, '').slice(0, 4)}`);
    return Number((2 + n * 8).toFixed(3));
  }
}
