/**
 * On-chain operation seams.
 * =========================
 *
 * Each function describes one product action in domain terms and delegates
 * signing to the active wallet adapter. Today the adapter is the mock, so
 * these return simulated signatures - but the call sites in the UI are already
 * final. Wiring Anchor/Metaplex means filling in the bodies here only.
 *
 * TODO(anchor):   load the Eventerz IDL, build instructions with @coral-xyz/anchor
 * TODO(metaplex): mint compressed tickets with @metaplex-foundation/mpl-bubblegum
 * TODO(helius):   read assets and transactions via the Helius DAS API
 */

import { integrationsConfig } from '@/constants/config';
import type { TransactionIntent } from '@/types';

import { walletService } from './wallet';

export interface OnChainResult {
  signature: string;
  /** Explorer deep link, handy for toasts and the dashboard. */
  explorerUrl: string;
}

function explorerUrl(signature: string): string {
  const cluster = integrationsConfig.solanaNetwork;
  const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

async function submit(intent: TransactionIntent): Promise<OnChainResult> {
  const { signature } = await walletService.signAndSendTransaction(intent);
  return { signature, explorerUrl: explorerUrl(signature) };
}

export const solanaService = {
  /**
   * Take a seat on-chain.
   *
   * `hostWallet` is required, not optional-looking. A paid event settles the
   * price to the host inside `claim_seat`, so the host account must be in the
   * transaction - and the instruction builder refuses without it. Leaving it to
   * the caller to remember is how this previously shipped as a call that threw
   * on every RSVP the moment a program id was configured.
   */
  rsvp: (eventId: string, hostWallet: string) =>
    submit({ type: 'rsvp', eventId, hostWallet }),

  /** Mint a compressed-NFT ticket to the attendee's wallet. */
  mintTicket: (eventId: string, owner: string) =>
    submit({ type: 'mint-ticket', eventId, owner }),

  /** Write attendance on-chain at the door. Needs the guest's wallet. */
  checkIn: (ticketId: string, eventId: string, attendeeWallet: string) =>
    submit({ type: 'check-in', ticketId, eventId, attendeeWallet }),

  /**
   * Publish the event account.
   *
   * Every field is required because the on-chain account is not a marker, it is
   * the event: `capacity` bounds seats and `startsAt`/`endsAt` bound the window
   * in which a seat can be claimed at all.
   *
   * This used to take only an id and let the instruction builder fill the rest
   * with defaults - capacity 1 and `startsAt = now`. On-chain that produced an
   * event whose claim window had already closed at the instant it was created,
   * so `claim_seat` failed with `EventOver` for every guest, for every event,
   * forever. Nothing surfaced it because no program was deployed to run it.
   */
  createEvent: (args: {
    eventId: string;
    capacity: number;
    startsAt: string;
    endsAt?: string | null;
    requiresApproval: boolean;
    priceLamports: bigint;
  }) => submit({ type: 'create-event', ...args }),

  /** Claim a Proof-of-Attendance badge. */
  claimBadge: (badgeId: string) => submit({ type: 'claim-badge', badgeId }),

  /**
   * Wallet holdings used by the Tickets tab and profile header.
   * TODO(helius): replace with a DAS `getAssetsByOwner` call.
   */
  async getWalletAssets(owner: string) {
    const balanceSol = await walletService.getBalanceSol(owner);
    return { balanceSol, tickets: [], badges: [] };
  },

  /**
   * Verify a token gate before allowing RSVP.
   * TODO(helius): check balances / NFT ownership against `gateRequirement`.
   */
  async checkTokenGate(_owner: string, _requirement?: string): Promise<boolean> {
    return true;
  },
};
