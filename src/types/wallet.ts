/**
 * Wallet abstraction contract.
 *
 * Screens only ever see these types. Swapping the mock adapter for Solana
 * Mobile Wallet Adapter means implementing `WalletAdapter` — no screen or hook
 * changes required.
 */

import type { SolanaCluster } from '@/constants/config';

/** Wallets surfaced in the connect sheet. */
export type WalletId =
  | 'seeker'
  | 'phantom'
  | 'solflare'
  | 'backpack'
  | 'jupiter';

export interface WalletDescriptor {
  id: WalletId;
  name: string;
  /** Short line under the wallet name in the connect sheet. */
  tagline: string;
  /** Brand colour used for the wallet's icon chip. */
  color: string;
  /** Store / download page, opened when the wallet is not installed. */
  downloadUrl: string;
  /**
   * True for the Seeker's built-in wallet, which is offered first on Solana
   * Mobile hardware.
   */
  native?: boolean;
}

export type WalletConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface WalletAccount {
  /** Base58 public key. */
  address: string;
  /** Wallet-provided display label, when one exists. */
  label?: string;
  walletId: WalletId;
  cluster: SolanaCluster;
}

export interface SignedTransactionResult {
  signature: string;
}

/**
 * The seam every wallet implementation fills.
 *
 * `MockWalletAdapter` (shipping today) fabricates addresses and signatures;
 * `MobileWalletAdapter` (see `services/wallet/mobile-wallet-adapter.ts`) will
 * proxy to `@solana-mobile/mobile-wallet-adapter-protocol-web3js`.
 */
export interface WalletAdapter {
  readonly id: string;
  /** Wallets this adapter can connect to, in display order. */
  listWallets(): Promise<WalletDescriptor[]>;
  connect(walletId: WalletId): Promise<WalletAccount>;
  disconnect(): Promise<void>;
  /** Restore a previous session without prompting the user. */
  restore(): Promise<WalletAccount | null>;
  signMessage(message: string): Promise<string>;
  signAndSendTransaction(
    intent: TransactionIntent,
  ): Promise<SignedTransactionResult>;
  getBalanceSol(address: string): Promise<number>;
}

/**
 * A description of what we want on-chain, independent of how it is built.
 * The mock adapter logs it; the real adapter compiles it into instructions.
 */
export type TransactionIntent =
  | { type: 'rsvp'; eventId: string }
  | { type: 'mint-ticket'; eventId: string; owner: string }
  | { type: 'check-in'; ticketId: string; eventId: string }
  | { type: 'create-event'; eventId: string }
  | { type: 'claim-badge'; badgeId: string };
