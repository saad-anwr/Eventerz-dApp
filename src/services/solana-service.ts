/**
 * On-chain operation seams.
 * =========================
 *
 * Each function describes one product action in domain terms and delegates
 * signing to the active wallet adapter. Today the adapter is the mock, so
 * these return simulated signatures — but the call sites in the UI are already
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
  /** Record an RSVP as a signed transaction. */
  rsvp: (eventId: string) => submit({ type: 'rsvp', eventId }),

  /** Mint a compressed-NFT ticket to the attendee's wallet. */
  mintTicket: (eventId: string, owner: string) =>
    submit({ type: 'mint-ticket', eventId, owner }),

  /** Write attendance on-chain at the door. */
  checkIn: (ticketId: string, eventId: string) =>
    submit({ type: 'check-in', ticketId, eventId }),

  /** Publish an event account. */
  createEvent: (eventId: string) => submit({ type: 'create-event', eventId }),

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
