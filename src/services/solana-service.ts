/**
 * On-chain operation seams.
 * =========================
 *
 * Each function describes one product action in domain terms and delegates
 * signing to the active wallet adapter. `USE_MOCK_WALLET` decides whether that
 * adapter is the mock or Mobile Wallet Adapter; production builds ship the real
 * one, so these are real signatures on mainnet.
 *
 * What still routes through here, and what does not:
 *
 *   • **Wallet-to-wallet transfers** are System Program instructions and need
 *     nothing deployed. These work today.
 *   • **Compressed ticket minting does *not* belong here.** A Bubblegum mint is
 *     signed by the tree authority, not by the person holding the ticket, so it
 *     runs server-side in the `mint-cnft` Edge Function where that key can live
 *     as a secret. Putting it here would both leak the authority to a client and
 *     let a guest mint their own ticket, which defeats the point of issuing one.
 *   • **A bespoke Anchor program was retired.** There is no IDL to load and no
 *     `@coral-xyz/anchor` instruction building to fill in - `Eventerz Program/`
 *     is kept for reference only. See its `DEPLOY_MAINNET.md`.
 *
 * TODO(helius): read assets and transactions via the Helius DAS API
 */

import type { TransactionIntent } from '@/types';
import { explorerTxUrl } from '@/utils/explorer';

import { walletService } from './wallet';

export interface OnChainResult {
  signature: string;
  /** Explorer deep link, handy for toasts and the dashboard. */
  explorerUrl: string;
}

async function submit(intent: TransactionIntent): Promise<OnChainResult> {
  const { signature } = await walletService.signAndSendTransaction(intent);
  return { signature, explorerUrl: explorerTxUrl(signature) };
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
