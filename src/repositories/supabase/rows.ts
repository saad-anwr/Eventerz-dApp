/**
 * Database row shapes for `0002_events.sql`, plus mappers to the domain models
 * the UI already speaks.
 *
 * Declared as `type` aliases, never interfaces — supabase-js checks rows
 * against `Record<string, unknown>`, and only type aliases get an implicit
 * index signature. An interface silently degrades every query to `never`.
 */

import type { CoverGradientKey } from '@/theme/colors';
import type {
  AppNotification,
  Community,
  EventCategory,
  EventItem,
  EventVisibility,
  NotificationKind,
  ScheduleSlot,
  Ticket,
  TicketStatus,
  User,
} from '@/types';

import type { ProfileRow } from '@/services/auth/types';

/* -------------------------------------------------------------------------- */
/*  Rows                                                                       */
/* -------------------------------------------------------------------------- */

export type EventRow = {
  id: string;
  title: string;
  description: string;
  host_id: string;
  community_id: string | null;
  cover_gradient: string;
  cover_image: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  location: string;
  is_online: boolean;
  capacity: number;
  price: string;
  visibility: EventVisibility;
  requires_approval: boolean;
  token_gated: boolean;
  gate_requirement: string | null;
  tags: string[];
  schedule: ScheduleSlot[];
  featured: boolean;
  onchain_signature: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: 'purple' | 'blue' | 'cyan' | 'green';
  cover_gradient: string;
  token_gated: boolean;
  verified: boolean;
  owner_id: string | null;
  created_at: string;
};

export type TicketRow = {
  id: string;
  event_id: string;
  owner_id: string;
  asset_id: string | null;
  serial: number;
  status: TicketStatus;
  soulbound: boolean;
  tier: string;
  qr_secret: string;
  minted_at: string;
  checked_in_at: string | null;
};

export type NotificationRow = {
  id: string;
  profile_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
};

export type RsvpRow = {
  id: string;
  event_id: string;
  profile_id: string;
  status: 'confirmed' | 'pending' | 'waitlist' | 'cancelled';
  wallet_address: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Mappers                                                                    */
/* -------------------------------------------------------------------------- */

const epoch = (iso: string) => Date.parse(iso) || Date.now();

/**
 * `attendeeIds` is not a column — it comes from a joined `rsvps` select. Callers
 * that do not need the roster pass an empty array rather than paying for the
 * join.
 */
export function toEventItem(row: EventRow, attendeeIds: string[] = []): EventItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    hostId: row.host_id,
    communityId: row.community_id ?? undefined,
    coverGradient: row.cover_gradient as CoverGradientKey,
    coverImage: row.cover_image ?? undefined,
    category: row.category,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    location: row.location,
    isOnline: row.is_online,
    capacity: row.capacity,
    price: row.price,
    visibility: row.visibility,
    requiresApproval: row.requires_approval,
    tokenGated: row.token_gated,
    gateRequirement: row.gate_requirement ?? undefined,
    tags: row.tags ?? [],
    schedule: row.schedule?.length ? row.schedule : undefined,
    featured: row.featured,
    attendeeIds,
    createdAt: epoch(row.created_at),
  };
}

export function toCommunity(
  row: CommunityRow,
  memberIds: string[] = [],
  eventCount = 0,
): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    coverGradient: row.cover_gradient as CoverGradientKey,
    memberCount: memberIds.length,
    eventCount,
    tokenGated: row.token_gated,
    verified: row.verified,
    memberIds,
  };
}

/**
 * The QR payload carries the ticket id and its server-issued secret. The secret
 * is random rather than derived, so a payload cannot be forged from public data.
 */
export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    eventId: row.event_id,
    ownerId: row.owner_id,
    assetId: row.asset_id ?? '',
    serial: row.serial,
    status: row.status,
    soulbound: row.soulbound,
    tier: row.tier,
    qrPayload: `eventerz:v1:checkin?ticket=${row.id}&secret=${row.qr_secret}`,
    mintedAt: epoch(row.minted_at),
    checkedInAt: row.checked_in_at ? epoch(row.checked_in_at) : undefined,
  };
}

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href ?? undefined,
    read: row.read,
    createdAt: epoch(row.created_at),
  };
}

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle ?? row.id.slice(0, 8),
    email: row.email ?? undefined,
    bio: row.bio ?? undefined,
    location: row.location ?? undefined,
    website: row.website ?? undefined,
    twitter: row.twitter ?? undefined,
    walletAddress: row.wallet_address ?? undefined,
    authMethod: row.wallet_address ? 'wallet' : 'google',
    reputation: row.reputation,
    interests: row.interests ?? [],
    createdAt: epoch(row.created_at),
  };
}

/** Parse a scanned QR payload back into its parts. */
export function parseQrPayload(
  payload: string,
): { ticketId: string; secret: string } | null {
  if (!payload.startsWith('eventerz:v1:checkin')) return null;
  const ticketId = /ticket=([0-9a-f-]+)/i.exec(payload)?.[1];
  const secret = /secret=([0-9a-f-]+)/i.exec(payload)?.[1];
  if (!ticketId || !secret) return null;
  return { ticketId, secret };
}
