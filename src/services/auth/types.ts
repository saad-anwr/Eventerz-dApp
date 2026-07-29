/**
 * Database contract, kept identical to the web app's `lib/supabase/types.ts`.
 *
 * Both must be `type` aliases rather than interfaces — supabase-js checks row
 * shapes against `Record<string, unknown>`, and only type aliases receive an
 * implicit index signature. Using an interface degrades every query's inferred
 * type to `never`.
 */

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
  email: string | null;
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
    };
    Views: Record<never, never>;
    Functions: {
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      rsvp: {
        Args: { p_event_id: string };
        Returns: DbTicket;
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
