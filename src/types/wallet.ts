/**
 * Wallet abstraction contract.
 *
 * Screens only ever see these types. Swapping the mock adapter for Solana
 * Mobile Wallet Adapter means implementing `WalletAdapter` - no screen or hook
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
   * The host this wallet reports as its `wallet_uri_base` at authorization.
   *
   * Used to name the wallet that actually answered the association, which is
   * not necessarily the row the user tapped - see `walletIdFromUriBase`. Kept
   * separate from `downloadUrl` on purpose: that one is a marketing page and
   * free to move, and identity should not break when it does.
   */
  uriBaseHost?: string;
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
  /**
   * The wallet's own `https` base URI, returned by `authorize`.
   *
   * Mobile Wallet Adapter uses this to reach *the same wallet* again. Without
   * it, every later association fires the generic `solana-wallet://` intent and
   * Android picks - which on a phone with more than one wallet installed means
   * the auth token from wallet A can be presented to wallet B. See
   * `MobileWalletAdapter#association`.
   *
   * Optional because a wallet is not obliged to send one, and because sessions
   * persisted before this field existed will not have it.
   */
  walletUriBase?: string;
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
 *
 * Two families, and the distinction matters:
 *
 *   • **Eventerz program intents** - `create-event`, `rsvp`, `check-in`,
 *     `claim-badge`, `mint-ticket`. These need the deployed program, so the
 *     adapter refuses them while `EXPO_PUBLIC_EVENTERZ_PROGRAM_ID` is unset
 *     rather than fabricating a signature.
 *   • **`transfer`** - a plain System Program transfer. It needs no program of
 *     ours at all, so it must work regardless of deployment state. Gating it on
 *     the program id would break sending crypto for a reason that has nothing to
 *     do with it.
 */
/*
 * The on-chain fields are **required**, deliberately.
 *
 * They were optional, and every caller omitted them. The instruction builder
 * then substituted defaults - capacity 1, `startsAt = now` - which produced an
 * on-chain event whose claim window had closed before anyone could reach it,
 * and an RSVP intent with no host wallet that threw on construction. Both were
 * invisible because no program was deployed to execute them; both would have
 * broken every event and every RSVP on the day one was.
 *
 * Making them required moves that from a runtime surprise to a compile error.
 */
export type TransactionIntent =
  | { type: 'rsvp'; eventId: string; hostWallet: string }
  | { type: 'mint-ticket'; eventId: string; owner: string }
  | { type: 'check-in'; ticketId: string; eventId: string; attendeeWallet: string }
  | {
      type: 'create-event';
      eventId: string;
      capacity: number;
      startsAt: string;
      endsAt?: string | null;
      requiresApproval: boolean;
      priceLamports: bigint;
    }
  | { type: 'cancel-event'; eventId: string }
  | { type: 'release-seat'; eventId: string }
  | { type: 'claim-badge'; badgeId: string }
  /**
   * The host's signed record of authorship - a memo-only transaction, no
   * lamports, no Eventerz program. See `services/solana/event-claim.ts`.
   *
   * Carries no amount because none moves: creating an event is free, and the
   * host pays only the network fee. It sits beside `transfer` in every place
   * that asks "does this intent need our program deployed?" - both answer no.
   */
  | { type: 'claim-event'; eventId: string }
  /** Base units, always. A float here is a rounding error in someone's money. */
  | { type: 'transfer'; to: string; lamports: bigint; memo?: string };
