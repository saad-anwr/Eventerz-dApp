/**
 * Ticket + badge data access.
 *
 * Tickets are lazily seeded on first read for whichever wallet is connected,
 * so the demo always has something in the Tickets tab without pretending the
 * data pre-existed the connection.
 */

import {
  buildMockBadges,
  buildMockTickets,
  buildQrPayload,
  db,
  mockUuid,
} from '@/mock';
import type { Badge, Ticket } from '@/types';
import { mockDelay } from '@/utils';
import { parseQrPayload } from '@/utils/check-in';

let seededFor: string | null = null;

function ensureSeeded(ownerId: string, ownerAddress: string) {
  if (seededFor === ownerId) return;
  buildMockTickets(ownerId, ownerAddress).forEach((t) => {
    db.tickets[t.id] = t;
  });
  seededFor = ownerId;
}

export const ticketRepository = {
  async listByOwner(ownerId: string, ownerAddress: string): Promise<Ticket[]> {
    await mockDelay();
    ensureSeeded(ownerId, ownerAddress);
    return Object.values(db.tickets)
      .filter((t) => t.ownerId === ownerId)
      .sort((a, b) => b.mintedAt - a.mintedAt);
  },

  async getById(id: string): Promise<Ticket | null> {
    await mockDelay();
    return db.tickets[id] ?? null;
  },

  async getByEvent(eventId: string, ownerId: string): Promise<Ticket | null> {
    await mockDelay();
    return (
      Object.values(db.tickets).find(
        (t) => t.eventId === eventId && t.ownerId === ownerId,
      ) ?? null
    );
  },

  /**
   * Mint a compressed-NFT ticket.
   *
   * This is the **mock** repository, so the asset id is fabricated and the
   * ticket is a local record - which is the honest answer for a backend that is
   * not there. The real path is the `mint-cnft` Edge Function: a Bubblegum mint
   * is signed by the tree authority, so it cannot run on the device. Do not
   * route this through `solanaService`; `MobileWalletAdapter` refuses
   * `mint-ticket` permanently and by design.
   */
  async mint(
    eventId: string,
    ownerId: string,
    ownerAddress: string,
    tier = 'General Admission',
  ): Promise<Ticket> {
    await mockDelay();
    // Uuid-shaped, not `uid('t')`: the payload this id goes into has to survive
    // `parseQrPayload`, which matches the server's uuid format. See `mockUuid`.
    const id = mockUuid();
    const secret = mockUuid();
    const serial =
      Object.values(db.tickets).filter((t) => t.eventId === eventId).length + 1;
    const ticket: Ticket = {
      id,
      eventId,
      ownerId,
      assetId: `cNFT_${serial}_${ownerAddress.slice(0, 6)}`,
      serial,
      status: 'valid',
      soulbound: false,
      tier,
      qrPayload: buildQrPayload(id, secret, ownerAddress),
      mintedAt: Date.now(),
    };
    db.tickets[id] = ticket;
    return ticket;
  },

  /** Burn/return a ticket when the holder cancels their RSVP. */
  async revokeForEvent(eventId: string, ownerId: string): Promise<void> {
    await mockDelay();
    Object.values(db.tickets)
      .filter((t) => t.eventId === eventId && t.ownerId === ownerId)
      .forEach((t) => {
        delete db.tickets[t.id];
      });
  },

  async checkIn(ticketId: string): Promise<Ticket> {
    await mockDelay();
    const ticket = db.tickets[ticketId];
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.status === 'used') throw new Error('Ticket already checked in');
    const next: Ticket = {
      ...ticket,
      status: 'used',
      checkedInAt: Date.now(),
    };
    db.tickets[ticketId] = next;
    return next;
  },

  /**
   * Validate a scanned QR payload and check the ticket in.
   * Throws with a user-facing message when the code is not ours.
   */
  async redeemQr(payload: string): Promise<Ticket> {
    await mockDelay();
    /*
     * The same parser the live path uses, rather than a second copy of the
     * accepted shapes. The copy that used to sit here matched on `ticket`
     * alone and never looked for `secret`, so a truncated code - the realistic
     * failure, from a half-scanned or creased QR - checked a guest in here and
     * was rejected as invalid against Supabase. A scanner that works against
     * the mock and fails against the real database is worse than one that
     * fails in both, which is the whole reason to share the definition instead
     * of promising in a comment to keep two in step.
     */
    const parsed = parseQrPayload(payload);
    if (!parsed) throw new Error('That QR code is not an Eventerz ticket.');
    const ticket = db.tickets[parsed.ticketId];
    if (!ticket) throw new Error('We could not find that ticket.');
    return ticketRepository.checkIn(parsed.ticketId);
  },

  async listBadges(_ownerId: string): Promise<Badge[]> {
    await mockDelay();
    return buildMockBadges().sort((a, b) => b.earnedAt - a.earnedAt);
  },
};
