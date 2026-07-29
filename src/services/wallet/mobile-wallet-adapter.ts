/**
 * Solana Mobile Wallet Adapter — placeholder implementation.
 * ==========================================================
 *
 * This file is the only thing that needs to change to go from mock to real
 * wallets. It already satisfies the `WalletAdapter` contract, so
 * `wallet-service.ts` can select it the moment the native module is present.
 *
 * ## Enabling it
 *
 * 1. MWA requires native code — it does **not** run in Expo Go. Create a
 *    development build first:
 *
 *        npx expo prebuild --platform android
 *        npx expo run:android
 *
 * 2. Install the protocol packages:
 *
 *        npx expo install \
 *          @solana-mobile/mobile-wallet-adapter-protocol \
 *          @solana-mobile/mobile-wallet-adapter-protocol-web3js \
 *          @solana/web3.js \
 *          react-native-get-random-values \
 *          buffer
 *
 * 3. Add the polyfills at the very top of `src/app/_layout.tsx`:
 *
 *        import 'react-native-get-random-values';
 *        import { Buffer } from 'buffer';
 *        global.Buffer = Buffer;
 *
 * 4. Replace each `notImplemented()` below with the commented reference
 *    implementation, then set `EXPO_PUBLIC_USE_MOCK_WALLET=false`.
 *
 * The auth token returned by `authorize` must be persisted through
 * `secureStorage` (never AsyncStorage) — it is a bearer credential.
 */

import { integrationsConfig } from '@/constants/config';
import type {
  SignedTransactionResult,
  TransactionIntent,
  WalletAccount,
  WalletAdapter,
  WalletDescriptor,
  WalletId,
} from '@/types';

import { SUPPORTED_WALLETS } from './wallets';

const IDENTITY = {
  name: 'Eventerz',
  uri: 'https://eventerz-three.vercel.app',
  icon: 'favicon.ico',
} as const;

function notImplemented(method: string): never {
  throw new Error(
    `MobileWalletAdapter.${method} is not wired yet. ` +
      'Follow the steps in services/wallet/mobile-wallet-adapter.ts, then set ' +
      'EXPO_PUBLIC_USE_MOCK_WALLET=false.',
  );
}

export class MobileWalletAdapter implements WalletAdapter {
  readonly id = 'mwa';

  /** The chain identifier MWA expects, derived from the configured cluster. */
  protected get chain(): string {
    return `solana:${integrationsConfig.solanaNetwork}`;
  }

  async listWallets(): Promise<WalletDescriptor[]> {
    // MWA does not enumerate wallets — Android's intent picker does. We still
    // show the curated list so the sheet looks the same before hand-off.
    return SUPPORTED_WALLETS;
  }

  async connect(_walletId: WalletId): Promise<WalletAccount> {
    /*
     * import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
     *
     * return transact(async (wallet) => {
     *   const auth = await wallet.authorize({
     *     chain: this.chain,
     *     identity: IDENTITY,
     *   });
     *   const account = auth.accounts[0];
     *   await secureStorage.set(SecureKeys.WALLET_AUTH_TOKEN, auth.auth_token);
     *   return {
     *     address: account.address,
     *     label: account.label,
     *     walletId: _walletId,
     *     cluster: integrationsConfig.solanaNetwork,
     *   };
     * });
     */
    void IDENTITY;
    notImplemented('connect');
  }

  async disconnect(): Promise<void> {
    /*
     * const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
     * if (token) {
     *   await transact((wallet) => wallet.deauthorize({ auth_token: token }));
     * }
     * await secureStorage.remove(SecureKeys.WALLET_AUTH_TOKEN);
     */
    notImplemented('disconnect');
  }

  async restore(): Promise<WalletAccount | null> {
    /*
     * const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
     * if (!token) return null;
     * return transact(async (wallet) => {
     *   const auth = await wallet.reauthorize({ auth_token: token, identity: IDENTITY });
     *   const account = auth.accounts[0];
     *   return { address: account.address, label: account.label, ... };
     * });
     */
    return null;
  }

  async signMessage(_message: string): Promise<string> {
    notImplemented('signMessage');
  }

  async signAndSendTransaction(
    _intent: TransactionIntent,
  ): Promise<SignedTransactionResult> {
    /*
     * Build the instruction with `solanaService.buildInstruction(_intent)`,
     * then:
     *
     * return transact(async (wallet) => {
     *   await wallet.reauthorize({ auth_token: token, identity: IDENTITY });
     *   const [signature] = await wallet.signAndSendTransactions({
     *     transactions: [transaction],
     *   });
     *   return { signature };
     * });
     */
    notImplemented('signAndSendTransaction');
  }

  async getBalanceSol(_address: string): Promise<number> {
    /*
     * const connection = new Connection(integrationsConfig.heliusRpcUrl);
     * const lamports = await connection.getBalance(new PublicKey(_address));
     * return lamports / LAMPORTS_PER_SOL;
     */
    notImplemented('getBalanceSol');
  }
}
