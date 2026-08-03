/**
 * Ticket + badge data access.
 *
 * Tickets are lazily seeded on first read for whichever wallet is connected,
 * so the demo always has something in the Tickets tab without pretending the
 * data pre-existed the connection.
 */

import { buildMockBadges, buildMockTickets, buildQrPayload, db } from '@/mock';
import type { Badge, Ticket } from '@/types';
import { mockDelay, uid } from '@/utils';

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
   * Mint a compressed-NFT ticket. Today this fabricates an asset id; the real
   * implementation calls `solanaService.mintTicket` and stores the returned id.
   */
  async mint(
    eventId: string,
    ownerId: string,
    ownerAddress: string,
    tier = 'General Admission',
  ): Promise<Ticket> {
    await mockDelay();
    const id = uid('t');
    const serial =
      Object.values(db.tickets).filter((t) => t.eventId === eventId).length + 1;
    const ticket: Ticket = {
      id,
      eventId,
      ownerId,
      assetId: `cNFT_${id}_${ownerAddress.slice(0, 6)}`,
      serial,
      status: 'valid',
      soulbound: false,
      tier,
      qrPayload: buildQrPayload(eventId, id, ownerAddress),
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
     * Same set of accepted shapes as the live path - the https link tickets
     * carry now, the app's deep link, and the legacy custom scheme. Kept in
     * step deliberately: a scanner that works against the mock and fails
     * against Supabase is worse than one that fails in both.
     */
    const looksLikeOurs =
      /^https?:\/\/[^\s]+\/checkin\?/i.test(payload.trim()) ||
      /^eventerz:(\/\/)?(v1:)?checkin\?/i.test(payload.trim());
    if (!looksLikeOurs) {
      throw new Error('That QR code is not an Eventerz ticket.');
    }
    const match = /[?&]ticket=([^&\s]+)/.exec(payload);
    const ticketId = match?.[1];
    if (!ticketId) throw new Error('This ticket code is malformed.');
    const ticket = db.tickets[ticketId];
    if (!ticket) throw new Error('We could not find that ticket.');
    return ticketRepository.checkIn(ticketId);
  },

  async listBadges(_ownerId: string): Promise<Badge[]> {
    await mockDelay();
    return buildMockBadges().sort((a, b) => b.earnedAt - a.earnedAt);
  },
};
