/**
 * Solana Mobile Wallet Adapter.
 *
 * The real wallet: talks to Phantom / Solflare / Backpack / the Seeker's
 * built-in wallet over the MWA protocol. **Android only** — MWA is an Android
 * association intent and has no iOS equivalent.
 *
 * Requires a development build; the protocol package ships native code, so it
 * does not run in Expo Go.
 *
 * Auth tokens live in expo-secure-store — they are bearer credentials that let
 * us reauthorize without prompting the user again.
 */

import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { toUint8Array } from 'js-base64';

import { integrationsConfig } from '@/constants/config';
import { SecureKeys, StorageKeys } from '@/constants/storage-keys';
import type {
  SignedTransactionResult,
  TransactionIntent,
  WalletAccount,
  WalletAdapter,
  WalletDescriptor,
  WalletId,
} from '@/types';
import { secureStorage, storage } from '@/utils';

import { SUPPORTED_WALLETS } from './wallets';

/** Identity shown in the wallet's approval sheet. */
const APP_IDENTITY = {
  name: 'Eventerz',
  uri: 'https://www.eventerz.xyz',
  icon: 'favicon.ico',
} as const;

/** MWA's `Chain` union — kept as literals so the type flows to `authorize`. */
const CHAIN_BY_CLUSTER = {
  'mainnet-beta': 'solana:mainnet',
  devnet: 'solana:devnet',
  testnet: 'solana:testnet',
} as const;

type MwaChain = (typeof CHAIN_BY_CLUSTER)[keyof typeof CHAIN_BY_CLUSTER];

function rpcEndpoint(): string {
  if (integrationsConfig.heliusRpcUrl) return integrationsConfig.heliusRpcUrl;
  const cluster = integrationsConfig.solanaNetwork;
  if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  return `https://api.${cluster}.solana.com`;
}

/**
 * MWA returns addresses base64-encoded. Everything downstream — display,
 * profiles, explorer links — expects base58, so normalise at the boundary.
 */
function toBase58(address: string): string {
  try {
    return new PublicKey(toUint8Array(address)).toBase58();
  } catch {
    // Some wallets already hand back base58.
    return address;
  }
}

export class MobileWalletAdapter implements WalletAdapter {
  readonly id = 'mwa';

  private get chain(): MwaChain {
    return (
      CHAIN_BY_CLUSTER[integrationsConfig.solanaNetwork] ?? 'solana:mainnet'
    );
  }

  private connection(): Connection {
    return new Connection(rpcEndpoint(), 'confirmed');
  }

  async listWallets(): Promise<WalletDescriptor[]> {
    // MWA does not enumerate wallets — Android's association picker does. The
    // curated list still renders so the sheet looks the same before hand-off.
    return SUPPORTED_WALLETS;
  }

  async connect(walletId: WalletId): Promise<WalletAccount> {
    return transact(async (wallet) => {
      const auth = await wallet.authorize({
        chain: this.chain,
        identity: APP_IDENTITY,
      });

      const account = auth.accounts[0];
      if (!account) throw new Error('The wallet returned no accounts.');

      const resolved: WalletAccount = {
        address: toBase58(account.address),
        label: account.label ?? undefined,
        walletId,
        cluster: integrationsConfig.solanaNetwork,
      };

      await secureStorage.set(SecureKeys.WALLET_AUTH_TOKEN, auth.auth_token);
      await storage.set(StorageKeys.WALLET_SESSION, resolved);

      return resolved;
    });
  }

  async disconnect(): Promise<void> {
    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);

    if (token) {
      try {
        await transact(async (wallet) => {
          await wallet.deauthorize({ auth_token: token });
        });
      } catch {
        // The wallet may have revoked us already, or been uninstalled. Either
        // way the local session must still be cleared.
      }
    }

    await secureStorage.remove(SecureKeys.WALLET_AUTH_TOKEN);
    await storage.remove(StorageKeys.WALLET_SESSION);
  }

  /**
   * Silent reconnect from the cached account, so launching the app does not
   * pop the wallet. Reauthorization happens lazily at signing time.
   */
  async restore(): Promise<WalletAccount | null> {
    const [account, token] = await Promise.all([
      storage.get<WalletAccount>(StorageKeys.WALLET_SESSION),
      secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN),
    ]);
    if (!account || !token) return null;
    return account;
  }

  async signMessage(message: string): Promise<string> {
    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      const [signed] = await wallet.signMessages({
        addresses: [auth.accounts[0].address],
        payloads: [new TextEncoder().encode(message)],
      });

      return Buffer.from(signed).toString('base64');
    });
  }

  /**
   * Sign and submit.
   *
   * `intent` says *what* the user wants on-chain. Until the Eventerz Anchor
   * program is deployed there are no instructions to build, so this refuses
   * rather than fabricating a signature — a fake success would be far worse
   * than an honest failure, because the UI would tell the user their ticket
   * was minted when nothing happened.
   */
  async signAndSendTransaction(
    intent: TransactionIntent,
  ): Promise<SignedTransactionResult> {
    if (!integrationsConfig.programId) {
      throw new Error(
        `On-chain ${intent.type.replace(/-/g, ' ')} is not available yet — ` +
          'the Eventerz program has not been deployed. Set ' +
          'EXPO_PUBLIC_EVENTERZ_PROGRAM_ID once it is live.',
      );
    }

    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
    const connection = this.connection();

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      const payer = new PublicKey(toBase58(auth.accounts[0].address));
      const { blockhash } = await connection.getLatestBlockhash();

      /*
       * TODO(anchor): build real instructions from the Eventerz IDL. The
       * surrounding shape — reauthorize, build, sign, send — is already
       * correct; only the instruction construction changes.
       */
      const transaction = new Transaction({
        feePayer: payer,
        recentBlockhash: blockhash,
      }).add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: payer,
          lamports: 0,
        }),
      );

      const [signature] = await wallet.signAndSendTransactions({
        transactions: [transaction],
      });

      return { signature };
    });
  }

  async getBalanceSol(address: string): Promise<number> {
    const lamports = await this.connection().getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  }
}
