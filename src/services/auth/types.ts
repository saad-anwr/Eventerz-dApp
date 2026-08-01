/**
 * Database contract, kept identical to the web app's `lib/supabase/types.ts`.
 *
 * Both must be `type` aliases rather than interfaces - supabase-js checks row
 * shapes against `Record<string, unknown>`, and only type aliases receive an
 * implicit index signature. Using an interface degrades every query's inferred
 * type to `never`.
 */

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

export type DbEvent = {
  id: string;
  title: string;
  description: string;
  host_id: string;
  community_id: string | null;
  cover_gradient: string;
  cover_image: string | null;
  category: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  is_online: boolean;
  capacity: number;
  price: string;
  visibility: string;
  requires_approval: boolean;
  token_gated: boolean;
  gate_requirement: string | null;
  tags: string[];
  schedule: unknown;
  featured: boolean;
  onchain_signature: string | null;
  created_at: string;
  updated_at: string;

  /* Denormalised by trigger in migration 0005 - see rows.ts for why. */
  confirmed_count: number;
  pending_count: number;
  waitlist_count: number;
  checked_in_count: number;

  /* Soft cancellation (0007). The row survives so ticket holders keep the
     record and the route still resolves. */
  cancelled_at: string | null;
  cancel_reason: string | null;

  /* Structured location (0006), alongside the free-text `location`. Null on
     anything created before that migration - both clients fall back to a map
     search, so null is supported rather than a gap. */
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  address: string | null;
};

/** `event_guests` view - an RSVP joined to its profile and ticket. */
export type DbEventGuest = {
  event_id: string;
  profile_id: string;
  status: string;
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

export type DbCommunity = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: string;
  cover_gradient: string;
  token_gated: boolean;
  verified: boolean;
  owner_id: string | null;
  created_at: string;
};

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

export type DbTicket = {
  id: string;
  event_id: string;
  owner_id: string;
  asset_id: string | null;
  serial: number;
  status: string;
  soulbound: boolean;
  tier: string;
  qr_secret: string;
  minted_at: string;
  checked_in_at: string | null;
};

export type DbNotification = {
  id: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
};

export type DbFriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
};

export type DbMessage = {
  id: string;
  scope: 'event' | 'dm';
  channel_id: string;
  sender_id: string;
  body: string;
  /** `payment` rows are written only by `record_payment`; see migration 0009. */
  kind: 'text' | 'payment';
  payment_id: string | null;
  created_at: string;
};

export type DbPayment = {
  id: string;
  signature: string;
  cluster: string;
  from_profile: string;
  to_profile: string | null;
  from_wallet: string;
  to_wallet: string;
  /** PostgREST serialises `bigint` as a string, because it exceeds 2^53. */
  amount: string;
  mint: string | null;
  symbol: string;
  decimals: number;
  memo: string | null;
  channel_id: string | null;
  verified: boolean;
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
      events: Table<DbEvent>;
      communities: Table<DbCommunity>;
      community_members: Table<DbCommunityMember>;
      rsvps: Table<DbRsvp>;
      tickets: Table<DbTicket>;
      notifications: Table<DbNotification>;
      friend_requests: Table<DbFriendRequest>;
      messages: Table<
        DbMessage,
        // A client may only insert plain text. Receipts come from
        // `record_payment`; see migration 0009.
        Pick<DbMessage, 'channel_id' | 'sender_id' | 'body' | 'scope'>
      >;
      payments: Table<DbPayment>;
    };
    Views: {
      event_guests: {
        Row: DbEventGuest;
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
        Returns: DbEvent;
      };
      cancel_event: {
        Args: { p_event_id: string; p_reason?: string | null };
        Returns: DbEvent;
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
        Returns: DbPayment;
      };
      dm_channel_id: {
        Args: { a: string; b: string };
        Returns: string;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
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
        Returns: DbTicket;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
