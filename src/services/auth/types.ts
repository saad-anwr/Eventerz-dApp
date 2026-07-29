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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: ProfileUpdate;
        Relationships: [];
      };
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
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
