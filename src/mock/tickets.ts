/**
 * Ticket + badge seeds for the signed-in wallet.
 *
 * `buildMockTickets` takes the current user id so tickets always belong to
 * whoever is connected — the mock wallet mints a fresh address per session.
 */

import type { Badge, Ticket } from '@/types';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Encode the payload a scanner reads. Real check-in will sign this with the
 * organizer's key; today it is a deterministic, human-inspectable string.
 */
export function buildQrPayload(
  eventId: string,
  ticketId: string,
  owner: string,
): string {
  return `eventerz:v1:checkin?event=${eventId}&ticket=${ticketId}&owner=${owner}`;
}

export function buildMockTickets(ownerId: string, ownerAddress: string): Ticket[] {
  const now = Date.now();

  const seeds: {
    id: string;
    eventId: string;
    serial: number;
    status: Ticket['status'];
    soulbound: boolean;
    tier: string;
    mintedAt: number;
    checkedInAt?: number;
  }[] = [
    {
      id: 't_summit',
      eventId: 'e_summit',
      serial: 42,
      status: 'valid',
      soulbound: false,
      tier: 'General Admission',
      mintedAt: now - 3 * DAY,
    },
    {
      id: 't_ama',
      eventId: 'e_ama',
      serial: 8,
      status: 'valid',
      soulbound: true,
      tier: 'Listener',
      mintedAt: now - 1 * DAY,
    },
    {
      id: 't_seeker',
      eventId: 'e_seeker',
      serial: 17,
      status: 'valid',
      soulbound: false,
      tier: 'Builder',
      mintedAt: now - 5 * DAY,
    },
    {
      id: 't_bp',
      eventId: 'e_past_bp',
      serial: 128,
      status: 'used',
      soulbound: true,
      tier: 'VIP',
      mintedAt: now - 24 * DAY,
      checkedInAt: now - 20 * DAY,
    },
    {
      id: 't_rust',
      eventId: 'e_past_rust',
      serial: 9,
      status: 'used',
      soulbound: false,
      tier: 'Workshop',
      mintedAt: now - 38 * DAY,
      checkedInAt: now - 35 * DAY,
    },
  ];

  return seeds.map((s) => ({
    ...s,
    ownerId,
    assetId: `cNFT_${s.id}_${ownerAddress.slice(0, 6)}`,
    qrPayload: buildQrPayload(s.eventId, s.id, ownerAddress),
  }));
}

export function buildMockBadges(): Badge[] {
  const now = Date.now();
  return [
    {
      id: 'b_early',
      name: 'Early Adopter',
      description: 'Joined Eventerz in the first cohort of wallets.',
      icon: 'Sparkles',
      accent: 'purple',
      earnedAt: now - 60 * DAY,
    },
    {
      id: 'b_poap_bp',
      name: 'Breakpoint Mobile Night',
      description: 'Proof of attendance — Singapore, Mobile Night.',
      icon: 'BadgeCheck',
      accent: 'cyan',
      earnedAt: now - 20 * DAY,
      eventId: 'e_past_bp',
    },
    {
      id: 'b_rust',
      name: 'Rust Intensive',
      description: 'Completed the full-day Solana Rust intensive.',
      icon: 'Trophy',
      accent: 'green',
      earnedAt: now - 35 * DAY,
      eventId: 'e_past_rust',
    },
    {
      id: 'b_streak',
      name: 'Three-Event Streak',
      description: 'Attended three events in a single month.',
      icon: 'Flame',
      accent: 'blue',
      earnedAt: now - 12 * DAY,
    },
    {
      id: 'b_host',
      name: 'First Event Hosted',
      description: 'Published and ran your first Eventerz event.',
      icon: 'Rocket',
      accent: 'purple',
      earnedAt: now - 45 * DAY,
    },
  ];
}
