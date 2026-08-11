/**
 * Ticket + badge seeds for the signed-in wallet.
 *
 * `buildMockTickets` takes the current user id so tickets always belong to
 * whoever is connected - the mock wallet mints a fresh address per session.
 */

import type { Badge, Ticket } from '@/types';
import { buildCheckInUrl } from '@/utils/check-in';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Encode the payload a scanner reads.
 *
 * Built with `buildCheckInUrl` - the same function `toTicket` uses for real
 * tickets - rather than a hand-assembled string, so the mock cannot drift away
 * from the live format.
 *
 * It had drifted. The old version emitted `secret=mock-<eventId>`, and the ids
 * below were `t_summit` and friends. `parseQrPayload` matches a uuid
 * (`[0-9a-f-]+`, because `tickets.id` and `tickets.qr_secret` are both `uuid`
 * in migration 0002), so *every* mock payload failed it. The mock scanner
 * appeared to work only because the mock repository carried a looser regex of
 * its own - which is exactly the split the comment here claimed to prevent.
 * Ids and secrets are uuid-shaped now, so the demo exercises the real parser.
 */
export function buildQrPayload(
  ticketId: string,
  secret: string,
  owner: string,
): string {
  return `${buildCheckInUrl(ticketId, secret)}&owner=${owner}`;
}

/**
 * Ticket ids, uuid-shaped so they survive `parseQrPayload`.
 *
 * Exported because `mock/notifications.ts` deep-links to one of them; a
 * hand-copied literal there would rot the first time an id changed here.
 */
/**
 * A uuid-shaped random id.
 *
 * `uid()` from `@/utils` emits base36, which `parseQrPayload` rejects - the
 * server's ids are uuids and the parser matches them. Freshly minted mock
 * tickets need ids of the same shape or they are unscannable, which is the bug
 * the seeds above already had. Hermes has no `crypto.randomUUID`, hence the
 * manual assembly; this is demo data, so uniqueness is all that is required of
 * it, not cryptographic randomness.
 */
export function mockUuid(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export const MOCK_TICKET_IDS = {
  summit: 'a1000000-0000-4000-8000-000000000001',
  ama: 'a1000000-0000-4000-8000-000000000002',
  seeker: 'a1000000-0000-4000-8000-000000000003',
  bp: 'a1000000-0000-4000-8000-000000000004',
  rust: 'a1000000-0000-4000-8000-000000000005',
} as const;

export function buildMockTickets(ownerId: string, ownerAddress: string): Ticket[] {
  const now = Date.now();

  const seeds: {
    id: string;
    /** Stands in for `tickets.qr_secret`, which is a uuid on the server. */
    secret: string;
    eventId: string;
    serial: number;
    status: Ticket['status'];
    soulbound: boolean;
    tier: string;
    mintedAt: number;
    checkedInAt?: number;
  }[] = [
    {
      id: MOCK_TICKET_IDS.summit,
      secret: 'b2000000-0000-4000-8000-000000000001',
      eventId: 'e_summit',
      serial: 42,
      status: 'valid',
      soulbound: false,
      tier: 'General Admission',
      mintedAt: now - 3 * DAY,
    },
    {
      id: MOCK_TICKET_IDS.ama,
      secret: 'b2000000-0000-4000-8000-000000000002',
      eventId: 'e_ama',
      serial: 8,
      status: 'valid',
      soulbound: true,
      tier: 'Listener',
      mintedAt: now - 1 * DAY,
    },
    {
      id: MOCK_TICKET_IDS.seeker,
      secret: 'b2000000-0000-4000-8000-000000000003',
      eventId: 'e_seeker',
      serial: 17,
      status: 'valid',
      soulbound: false,
      tier: 'Builder',
      mintedAt: now - 5 * DAY,
    },
    {
      id: MOCK_TICKET_IDS.bp,
      secret: 'b2000000-0000-4000-8000-000000000004',
      eventId: 'e_past_bp',
      serial: 128,
      status: 'used',
      soulbound: true,
      tier: 'VIP',
      mintedAt: now - 24 * DAY,
      checkedInAt: now - 20 * DAY,
    },
    {
      id: MOCK_TICKET_IDS.rust,
      secret: 'b2000000-0000-4000-8000-000000000005',
      eventId: 'e_past_rust',
      serial: 9,
      status: 'used',
      soulbound: false,
      tier: 'Workshop',
      mintedAt: now - 38 * DAY,
      checkedInAt: now - 35 * DAY,
    },
  ];

  return seeds.map(({ secret, ...s }) => ({
    ...s,
    ownerId,
    assetId: `cNFT_${s.serial}_${ownerAddress.slice(0, 6)}`,
    qrPayload: buildQrPayload(s.id, secret, ownerAddress),
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
      description: 'Proof of attendance - Singapore, Mobile Night.',
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
