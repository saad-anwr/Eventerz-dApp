/**
 * Database row shapes for `0002_events.sql`, plus mappers to the domain models
 * the UI already speaks.
 *
 * Declared as `type` aliases, never interfaces - supabase-js checks rows
 * against `Record<string, unknown>`, and only type aliases get an implicit
 * index signature. An interface silently degrades every query to `never`.
 */

import type { CoverGradientKey } from '@/theme/colors';
import type {
  AppNotification,
  Community,
  EventCategory,
  EventGuest,
  EventItem,
  EventVisibility,
  Message,
  NotificationKind,
  PaymentReceipt,
  RsvpState,
  ScheduleSlot,
  Ticket,
  TicketStatus,
  User,
} from '@/types';

import type { ProfileRow } from '@/services/auth/types';
import { buildCheckInUrl } from '@/utils/check-in';

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

  /*
   * Denormalised by trigger in migration 0005. Needed because the roster is no
   * longer world-readable: a stranger must still see "42 going" without being
   * able to list the 42, and counting from rows RLS hides would report 0.
   */
  confirmed_count: number;
  pending_count: number;
  waitlist_count: number;
  checked_in_count: number;

  /*
   * Cancellation is soft (migration 0007). The row survives so ticket holders
   * keep the record and the route still resolves.
   */
  cancelled_at: string | null;
  cancel_reason: string | null;

  /*
   * Structured location (0006), alongside the free-text `location` the host
   * typed. Null on every event created before that migration - both clients
   * fall back to a map search, so null is supported rather than a gap.
   */
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  address: string | null;
};

export type MessageRow = {
  id: string;
  scope: 'event' | 'dm';
  channel_id: string;
  sender_id: string;
  body: string;
  kind: 'text' | 'payment';
  payment_id: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  signature: string;
  cluster: string;
  from_profile: string;
  to_profile: string | null;
  from_wallet: string;
  to_wallet: string;
  /** PostgREST serialises `bigint` as a string. Keep it that way. */
  amount: string;
  mint: string | null;
  symbol: string;
  decimals: number;
  memo: string | null;
  channel_id: string | null;
  verified: boolean;
  created_at: string;
};

export type FriendRequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
};

/** `event_guests` view - an RSVP joined to its profile and ticket. */
export type EventGuestRow = {
  event_id: string;
  profile_id: string;
  status: RsvpState;
  created_at: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  reputation: number;
  ticket_id: string | null;
  ticket_serial: number | null;
  ticket_status: string | null;
  checked_in_at: string | null;
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

/* -------------------------------------------------------------------------- */
/*  Mappers                                                                    */
/* -------------------------------------------------------------------------- */

const epoch = (iso: string) => Date.parse(iso) || Date.now();

/**
 * `attendeeIds` and `myStatus` are not columns - they come from a joined `rsvps`
 * select. Callers that do not need the roster pass nothing rather than paying
 * for the join; the counts below come from the event row itself, so a caller
 * that skips the join still renders correct numbers.
 */
export function toEventItem(
  row: EventRow,
  attendeeIds: string[] = [],
  myStatus?: RsvpState,
  waitlistPosition?: number,
): EventItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    hostId: row.host_id,
    communityId: row.community_id ?? undefined,
    coverGradient: row.cover_gradient as CoverGradientKey,
    coverImage: displayableBanner(row.cover_image),
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

    // `?? 0` rather than a bare read: these columns arrive with migration 0005,
    // and a build running against a database without it should show "0 going"
    // rather than "NaN going".
    confirmedCount: row.confirmed_count ?? 0,
    pendingCount: row.pending_count ?? 0,
    waitlistCount: row.waitlist_count ?? 0,
    checkedInCount: row.checked_in_count ?? 0,
    myStatus,
    waitlistPosition,

    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,

    // The host's signed record of authorship, once `claim-event` has verified
    // it against the cluster. Null means unclaimed - which is a normal state,
    // not a broken one: signing is optional and the event is live either way.
    onchainSignature: row.onchain_signature ?? undefined,

    // `?? undefined`, never `?? 0`: a missing coordinate has to stay missing.
    // Zero is the Gulf of Guinea, and a confident pin in the wrong ocean is
    // worse than no map at all.
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    placeId: row.place_id ?? undefined,
    address: row.address ?? undefined,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    scope: row.scope,
    channelId: row.channel_id,
    senderId: row.sender_id,
    body: row.body,
    kind: row.kind ?? 'text',
    paymentId: row.payment_id ?? undefined,
    createdAt: epoch(row.created_at),
  };
}

export function toPaymentReceipt(row: PaymentRow): PaymentReceipt {
  return {
    id: row.id,
    signature: row.signature,
    cluster: row.cluster,
    fromProfile: row.from_profile,
    toProfile: row.to_profile ?? undefined,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    // Left as a string all the way to the formatter. See `PaymentReceipt`.
    amount: String(row.amount),
    mint: row.mint ?? undefined,
    symbol: row.symbol,
    decimals: row.decimals,
    memo: row.memo ?? undefined,
    channelId: row.channel_id ?? undefined,
    verified: row.verified,
    createdAt: epoch(row.created_at),
  };
}

export function toEventGuest(row: EventGuestRow): EventGuest {
  return {
    eventId: row.event_id,
    profileId: row.profile_id,
    status: row.status,
    name: row.name,
    handle: row.handle ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    walletAddress: row.wallet_address ?? undefined,
    reputation: row.reputation,
    ticketSerial: row.ticket_serial ?? undefined,
    checkedInAt: row.checked_in_at ? epoch(row.checked_in_at) : undefined,
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
 * A banner URL that can actually be fetched, or nothing.
 *
 * Events created before the upload step existed stored the picker's local path
 * - `file:///data/user/0/.../ImagePicker/abc.jpeg` - straight into
 * `cover_image`. That file lives in a cache directory the OS clears, and means
 * nothing on any other device, so the value is unusable everywhere including
 * the phone that wrote it.
 *
 * `uploadEventBanner` fixed the write path; this guards the read, both for the
 * rows already stored and against anything that writes a bad value later. A
 * missing banner falls back to the event's gradient, which is the designed
 * empty state rather than a broken image.
 */
export function displayableBanner(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^(https?:)?\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

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
    qrPayload: buildCheckInUrl(row.id, row.qr_secret),
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
    // `row.id ?? ''` because this line threw the TypeError that cost the dApp
    // Store submission - see 0024. A mapper is the wrong place to discover that
    // a row is not a row, but it is the last place that can avoid a crash.
    handle: row.handle ?? (row.id ?? '').slice(0, 8),
    /*
     * No `email`. `toUser` maps whatever profile was fetched - a host, an
     * attendee, a search result - so anything set here is somebody else's. The
     * column is not readable by clients at all (0015); the signed-in user's own
     * address lives on `authStore.sessionEmail`.
     */
    bio: row.bio ?? undefined,
    /*
     * The row carries `avatar_url` and this mapper used to drop it, so every
     * identity that came through here was avatar-less. Uploading a picture
     * therefore looked like it worked - `pickAvatar` sets its own local state
     * from the upload result, and the edit screen renders that - and the
     * picture vanished on the next reload, when the same profile was rebuilt
     * from a row whose avatar this line had thrown away.
     *
     * Nothing was ever wrong with the upload or the column: `update` already
     * writes `avatar_url` and guards it against being blanked by an unrelated
     * save. It was only ever the read path.
     */
    avatarUrl: row.avatar_url ?? undefined,
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

