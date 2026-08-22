/**
 * Database contract, kept identical to the web app's `lib/supabase/types.ts`.
 *
 * Both must be `type` aliases rather than interfaces - supabase-js checks row
 * shapes against `Record<string, unknown>`, and only type aliases receive an
 * implicit index signature. Using an interface degrades every query's inferred
 * type to `never`.
 */

import type {
  EventCategory,
  EventVisibility,
  NotificationKind,
  RsvpState,
  ScheduleSlot,
  TicketStatus,
} from '@/types';

/**
 * The columns of `profiles` a client may read, as a PostgREST select list.
 *
 * The counterpart to `PROFILE_COLUMNS` in the web app. The two need **not** be
 * identical - each is an allow-list of what that client reads, so the web list
 * carries `twitter_verified` for the verified tick and this one does not,
 * because the mobile app has no such UI. What they must share is the ceiling:
 * neither may name a column the database refuses (`email`, dropped in 0021).
 *
 * Use it instead of `select('*')`: `*` means "whatever columns exist when the
 * query runs", so a column added later is published to every caller by default,
 * and the mistake surfaces as a privacy incident rather than a build failure.
 *
 * `email` is absent on purpose. Migration 0015 revokes SELECT on it from `anon`
 * and `authenticated`, because `profiles` is world-readable and RLS cannot
 * exclude a single column - so the row published every address held, and the
 * email -> wallet_address join with it. The signed-in user's own address comes
 * from the session instead.
 *
 * Single literal with `as const`, not a concatenation: supabase-js parses this
 * string at the type level, and `'a' + 'b'` widens to `string`, which collapses
 * every profile query to `GenericStringError`.
 */
export const PROFILE_COLUMNS =
  'id, name, handle, avatar_url, bio, location, website, twitter, wallet_address, reputation, interests, created_at, updated_at' as const;

export type ProfileRow = {
  id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  /** Primary identity. Null means wallet-pending. */
  wallet_address: string | null;
  /*
   * `email` is deliberately absent - the column exists but clients cannot read
   * it (0015). Leaving it off the type is what stops it creeping back: a query
   * asking for it fails to compile rather than failing in production.
   */
  reputation: number;
  interests: string[];
  created_at: string;
  updated_at: string;
};

/**
 * A profile RPC result, or null if what came back is not a profile.
 *
 * # Why casting is not enough
 *
 * Several functions are declared `returns public.profiles` - a bare composite
 * rather than a `setof`. Postgres answers those with **exactly one row**, and
 * when the inner select matches nothing that row is not absent: every column
 * comes back NULL. PostgREST reports it as a JSON object, so `data` is truthy,
 * `data as ProfileRow` type-checks, and the caller has a `ProfileRow` whose
 * `id` is null.
 *
 * That is precisely how onboarding broke for the dApp Store reviewer - see the
 * header of migration 0024 - and `unlink_wallet_address`, `set_primary_wallet`
 * and `sync_x_identity` all still return that shape. The functions themselves
 * only reach it if a signed-in user has no profile row, which should not
 * happen; the point is that "should not happen" is exactly what the last one
 * was, and the cost of checking is one comparison.
 *
 * So: a row is a profile when it has an id. Anything else is null, and callers
 * decide what that means rather than discovering it several frames later in a
 * mapper.
 */
export function asProfileRow(data: unknown): ProfileRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Partial<ProfileRow>;
  return typeof row.id === 'string' && row.id.length > 0
    ? (row as ProfileRow)
    : null;
}

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'name'
    | 'handle'
    | 'bio'
    | 'location'
    | 'website'
    | 'twitter'
    | 'interests'
    | 'avatar_url'
  >
>;

/* -------------------------------------------------------------------------- */
/*  Rows from 0002_events.sql                                                  */
/* -------------------------------------------------------------------------- */

export type DbCommunityMember = {
  community_id: string;
  profile_id: string;
  joined_at: string;
};

export type DbRsvp = {
  id: string;
  event_id: string;
  profile_id: string;
  status: string;
  wallet_address: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Table and view rows                                                       */
/* -------------------------------------------------------------------------- */

/*
 * These shapes were declared twice: a widened `Db*` copy here to type the
 * supabase-js client, and a narrow `*Row` copy in
 * `repositories/supabase/rows.ts` for the mappers - one pair per table. Two
 * declarations of the same table drift, and they had: a column added to one
 * was simply absent from the other. The narrow shape is now the only one, and
 * `rows.ts` re-exports these beside the mappers that read them.
 */

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

/** Helper: a table whose Insert allows omitting server-defaulted columns. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        ProfileUpdate
      >;
      events: Table<EventRow>;
      communities: Table<CommunityRow>;
      community_members: Table<DbCommunityMember>;
      rsvps: Table<DbRsvp>;
      tickets: Table<TicketRow>;
      notifications: Table<NotificationRow>;
      friend_requests: Table<FriendRequestRow>;
      messages: Table<
        MessageRow,
        // A client may only insert plain text. Receipts come from
        // `record_payment`; see migration 0009.
        Pick<MessageRow, 'channel_id' | 'sender_id' | 'body' | 'scope'>
      >;
      payments: Table<PaymentRow>;
    };
    Views: {
      event_guests: {
        Row: EventGuestRow;
        Relationships: [];
      };
    };
    Functions: {
      /**
       * @deprecated Revoked in 0011 - it linked a wallet without checking that
       * the caller held its key. Use the `link-wallet` Edge Function.
       */
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      /** Returns the full challenge *text* to sign, not a bare nonce. */
      issue_wallet_link_nonce: {
        Args: { p_wallet_address: string };
        Returns: string;
      };
      unlink_wallet: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };

      /* ---- Multi-wallet accounts (migration 0022) --------------------------
       * An account holds a set of wallets, one of them primary and mirrored
       * into `profiles.wallet_address`. See the migration header for why the
       * account is rooted in Google rather than in a keypair.
       * -------------------------------------------------------------------- */

      /** The caller's own wallets, primary first. RLS scopes it to them. */
      my_wallets: {
        Args: Record<string, never>;
        Returns: {
          address: string;
          profile_id: string;
          is_primary: boolean;
          label: string | null;
          linked_at: string;
        }[];
      };
      /** Detach one wallet. `unlink_wallet` detaches the primary. */
      unlink_wallet_address: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      /** Promote one of the caller's wallets to primary. */
      set_primary_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      /**
       * `unlinked` | `mine` | `taken`.
       *
       * A verdict rather than an owner id, so an anonymous caller cannot turn
       * the address space into a directory of accounts.
       */
      wallet_link_status: {
        Args: { p_wallet_address: string };
        Returns: 'unlinked' | 'mine' | 'taken';
      };
      /* `profile_for_wallet` is declared further down - 0022 changed what it
         resolves through (`wallet_links` rather than the column), not its
         signature. */
      update_event: {
        Args: {
          p_event_id: string;
          p_title?: string;
          p_description?: string;
          p_category?: string;
          p_starts_at?: string;
          p_ends_at?: string | null;
          p_clear_ends_at?: boolean;
          p_location?: string;
          p_is_online?: boolean;
          p_capacity?: number;
          p_price?: string;
          p_visibility?: string;
          p_requires_approval?: boolean;
          p_tags?: string[];
          p_cover_gradient?: string;
          p_cover_image?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_place_id?: string | null;
          p_address?: string | null;
        };
        Returns: EventRow;
      };
      cancel_event: {
        Args: { p_event_id: string; p_reason?: string | null };
        Returns: EventRow;
      };
      my_waitlist_position: {
        Args: { p_event_id: string };
        Returns: number | null;
      };
      my_waitlist_positions: {
        Args: { p_event_ids: string[] };
        Returns: { event_id: string; queue_position: number }[];
      };
      my_dm_partners: {
        Args: Record<string, never>;
        Returns: { profile_id: string; last_message_at: string }[];
      };
      record_payment: {
        Args: {
          p_signature: string;
          p_to_wallet: string;
          p_amount: string;
          p_channel_id?: string | null;
          p_to_profile?: string | null;
          p_memo?: string | null;
          p_mint?: string | null;
          p_symbol?: string;
          p_decimals?: number;
          p_cluster?: string;
        };
        Returns: PaymentRow;
      };
      dm_channel_id: {
        Args: { a: string; b: string };
        Returns: string;
      };
      /**
       * An array, since 0024 made this `returns setof public.profiles`.
       *
       * It was `returns public.profiles`, a bare composite, which Postgres
       * always answers with exactly one row - a row of NULLs when nothing
       * matched. That is what crashed onboarding for every wallet that had
       * never been linked. A set returns nothing when there is nothing.
       *
       * Callers use `.maybeSingle()`, which coerces a one-row array to an
       * object and gives `null` for zero rows, so the shape change is
       * absorbed there.
       */
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow[];
      };
      /** Legacy alias for `request_to_join`, kept for installed builds. */
      rsvp: {
        Args: { p_event_id: string };
        Returns: DbRsvp;
      };
      request_to_join: {
        Args: { p_event_id: string };
        Returns: DbRsvp;
      };
      approve_guest: {
        Args: { p_event_id: string; p_profile_id: string };
        Returns: DbRsvp;
      };
      decline_guest: {
        Args: { p_event_id: string; p_profile_id: string };
        Returns: DbRsvp;
      };
      event_guest_preview: {
        Args: { p_event_id: string; p_limit?: number };
        Returns: { id: string; name: string; avatar_url: string | null }[];
      };
      promote_from_waitlist: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      cancel_rsvp: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      check_in_ticket: {
        Args: { p_ticket_id: string; p_qr_secret: string };
        Returns: TicketRow;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
