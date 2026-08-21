/**
 * Domain models.
 *
 * `User`, `EventItem` and `EventCategory` are ported from the web app's
 * `lib/store/types.ts` so a shared package can later own both. The mobile-only
 * additions (tickets, communities, badges, notifications) sit below and follow
 * the same conventions: ISO strings for calendar dates, epoch millis for
 * "created at" style timestamps.
 */

import type { CoverGradientKey } from '@/theme/colors';

/* -------------------------------------------------------------------------- */
/*  Identity                                                                   */
/* -------------------------------------------------------------------------- */

export type AuthMethod = 'wallet' | 'google' | 'apple' | 'email';

export interface User {
  id: string;
  name: string;
  /** Handle without the leading `@`. */
  handle: string;
  email?: string;
  bio?: string;
  location?: string;
  website?: string;
  twitter?: string;
  walletAddress?: string;
  /**
   * Uploaded profile picture, when there is one. Absent means the deterministic
   * gradient-initial avatar.
   *
   * `toUser` has always mapped this from `profiles.avatar_url`; the field was
   * missing from the type, so every read dropped it and nothing could write it.
   */
  avatarUrl?: string;
  authMethod: AuthMethod;
  /** Portable on-chain reputation score. */
  reputation: number;
  interests: string[];
  createdAt: number;
  /** Seeded demo accounts are discoverable but are never "you". */
  seeded?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

export const EVENT_CATEGORIES = [
  'Conference',
  'Meetup',
  'Hackathon',
  'Workshop',
  'DAO',
  'Party',
  'AMA',
  'Concert',
  'Other',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type EventVisibility = 'public' | 'private' | 'unlisted';

export interface ScheduleSlot {
  id: string;
  /** "10:00" - local to the event's location. */
  time: string;
  title: string;
  speaker?: string;
  durationMins: number;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  hostId: string;
  /** Key into `theme/colors.ts` -> `coverGradients`. */
  coverGradient: CoverGradientKey;
  /** Optional remote banner; the gradient renders when absent. */
  coverImage?: string;
  category: EventCategory;
  /** ISO 8601. */
  startsAt: string;
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  /** Display string - "Free" or "0.5 SOL". */
  price: string;
  visibility: EventVisibility;
  requiresApproval: boolean;
  tokenGated: boolean;
  /** Human-readable gate, e.g. "Holds >= 1 MadLads NFT". */
  gateRequirement?: string;
  /**
   * Confirmed guests, and only when this viewer may see them - the host or a
   * confirmed guest. Empty otherwise, because the roster is gated in Postgres.
   * Read counts from `confirmedCount`, never from this array's length.
   */
  attendeeIds: string[];
  tags: string[];
  communityId?: string;
  schedule?: ScheduleSlot[];
  /** Set when the event is boosted onto the Home carousel. */
  featured?: boolean;
  createdAt: number;

  /**
   * Live counts, visible to everyone, maintained server-side by trigger.
   * Optional because the mock backend has no trigger - there `attendeeIds` is
   * the whole truth. Read them through the helpers in `utils/rsvp.ts`.
   */
  confirmedCount?: number;
  pendingCount?: number;
  waitlistCount?: number;
  checkedInCount?: number;
  /** This viewer's own RSVP state, or undefined if they never asked. */
  myStatus?: RsvpState;

  /**
   * The viewer's 1-based place in the waitlist queue, when they are on it.
   *
   * Cannot be derived on the client: RLS returns a waitlisted guest exactly one
   * RSVP row - their own - so the people ahead of them are rows this client may
   * not read. Comes from `my_waitlist_position`.
   */
  waitlistPosition?: number;

  /** Set when the host called the event off. The row survives; see 0007. */
  cancelledAt?: string;
  cancelReason?: string;

  /**
   * The host's on-chain record of authorship, once verified.
   *
   * Undefined means unclaimed, which is an ordinary state: signing is optional
   * and the event is live either way. Only ever written by the `claim-event`
   * Edge Function after it has read the transaction back off the cluster - a
   * signature a client supplied is a string, not a proof, which is why there is
   * no client write grant for the column.
   */
  onchainSignature?: string;

  /**
   * Structured location, when the host's input resolved to a place. Undefined
   * is a supported state, not a gap - the UI falls back to a map search on the
   * `location` string.
   */
  latitude?: number;
  longitude?: number;
  placeId?: string;
  /** Formatted address from the geocoder; `location` stays the host's wording. */
  address?: string;
}

/**
 * Mirrors the `rsvp_status` enum in Postgres.
 *
 * `confirmed` holds a seat and a ticket; `pending` is waiting on the host;
 * `waitlist` is promoted automatically when a seat frees; `declined` is the
 * host's no; `cancelled` is the guest's own withdrawal.
 */
export type RsvpState =
  | 'confirmed'
  | 'pending'
  | 'waitlist'
  | 'declined'
  | 'cancelled';

/** A row of the host's guest list: the RSVP joined to its profile and ticket. */
export interface EventGuest {
  eventId: string;
  profileId: string;
  status: RsvpState;
  name: string;
  handle?: string;
  avatarUrl?: string;
  walletAddress?: string;
  reputation: number;
  ticketSerial?: number;
  checkedInAt?: number;
  createdAt: number;
}

/** A bounded sample of confirmed guests, for viewers who cannot read the roster. */
export interface GuestPreviewEntry {
  id: string;
  name: string;
  avatarUrl?: string;
}

/* -------------------------------------------------------------------------- */
/*  Tickets & badges                                                           */
/* -------------------------------------------------------------------------- */

export type TicketStatus = 'valid' | 'used' | 'expired' | 'pending';

export interface Ticket {
  id: string;
  eventId: string;
  ownerId: string;
  /** Compressed-NFT asset id once minted on-chain. */
  assetId: string;
  /** Sequential ticket number within the event. */
  serial: number;
  status: TicketStatus;
  /** Non-transferable tickets are bound to the RSVP wallet. */
  soulbound: boolean;
  tier: string;
  /** Payload encoded into the check-in QR code. */
  qrPayload: string;
  mintedAt: number;
  checkedInAt?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name, resolved by `components/ui/icon.tsx`. */
  icon: string;
  accent: 'purple' | 'blue' | 'cyan' | 'green';
  earnedAt: number;
  eventId?: string;
}

/* -------------------------------------------------------------------------- */
/*  Communities                                                                */
/* -------------------------------------------------------------------------- */

export interface Community {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  accent: 'purple' | 'blue' | 'cyan' | 'green';
  coverGradient: CoverGradientKey;
  memberCount: number;
  eventCount: number;
  tokenGated: boolean;
  verified: boolean;
  memberIds: string[];
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every `kind` the database writes, plus the mobile-only ones.
 *
 * The SQL functions insert `rsvp`, `ticket`, `event`, `reminder`, `payment`,
 * `security` and `reputation`; the app adds `wallet`, `community` and
 * `event-reminder` (locally scheduled). Keeping the union complete matters
 * because `components/ui/icon.tsx` maps kind -> icon, and an unmapped kind
 * renders a blank space where every other row has a symbol.
 */
export type NotificationKind =
  | 'wallet'
  | 'event'
  | 'event-reminder'
  | 'reminder'
  | 'rsvp'
  | 'ticket'
  | 'payment'
  | 'security'
  | 'community'
  | 'reputation'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  /** In-app route to open on tap, e.g. `/event/e_summit`. */
  href?: string;
}

/* -------------------------------------------------------------------------- */
/*  Messages & payments                                                        */
/* -------------------------------------------------------------------------- */

export type MessageScope = 'event' | 'dm';

/**
 * A chat message.
 *
 * `kind` distinguishes something typed from a payment receipt. Receipts are
 * written only by the `record_payment` SQL function - the insert policy on
 * `messages` pins client writes to `text` - so a client cannot post a receipt
 * for a transfer that never happened.
 */
export interface Message {
  id: string;
  scope: MessageScope;
  /** Event id for event chat, or `dm:<a>__<b>` sorted, for a DM. */
  channelId: string;
  senderId: string;
  body: string;
  kind: 'text' | 'payment';
  paymentId?: string;
  createdAt: number;
}

/** An inbox row: someone, and the last thing said. */
export interface Conversation {
  user: User;
  last?: Message;
  /**
   * Distinguishes a friend from someone who arrived through "Contact host".
   * An unexplained stranger in an inbox reads as spam.
   */
  isFriend: boolean;
}

/**
 * A crypto transfer sent from a thread.
 *
 * `amount` is a string of base units, not a number: Postgres `bigint` exceeds
 * `Number.MAX_SAFE_INTEGER`, and a silently truncated amount is the worst
 * possible bug in a payment path. Parse with `BigInt`.
 */
export interface PaymentReceipt {
  id: string;
  signature: string;
  cluster: string;
  fromProfile: string;
  toProfile?: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  /** Undefined for native SOL; an SPL mint address otherwise. */
  mint?: string;
  symbol: string;
  decimals: number;
  memo?: string;
  channelId?: string;
  /**
   * False until the `verify-payment` Edge Function has checked the signature
   * against the cluster. Render it without a tick - an unchecked claim must not
   * look like a checked one.
   */
  verified: boolean;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Organizer analytics                                                        */
/* -------------------------------------------------------------------------- */

export interface OrganizerStats {
  eventsCreated: number;
  ticketsMinted: number;
  /** Denominated in SOL. */
  revenueSol: number;
  attendanceRate: number;
  /** Percentage deltas vs. the previous period, e.g. "+12%". */
  deltas: {
    eventsCreated: string;
    ticketsMinted: string;
    revenueSol: string;
    attendanceRate: string;
  };
}

export interface AnalyticsPoint {
  label: string;
  value: number;
}

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  walletAddress: string;
  createdAt: number;
  status: 'confirmed' | 'pending' | 'waitlist';
}

/* -------------------------------------------------------------------------- */
/*  Discovery                                                                  */
/* -------------------------------------------------------------------------- */

export type DateFilter = 'any' | 'today' | 'this-week' | 'this-month';

export type SortOrder = 'soonest' | 'popular' | 'newest';

export interface EventFilters {
  query: string;
  categories: EventCategory[];
  date: DateFilter;
  location: string | null;
  onlineOnly: boolean;
  freeOnly: boolean;
  sort: SortOrder;
}

export interface Page<T> {
  items: T[];
  /** Cursor for the next page; `null` when the list is exhausted. */
  nextCursor: number | null;
  total: number;
}
