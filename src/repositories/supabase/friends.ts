/**
 * Friends, Supabase-backed.
 *
 * Mirrors the website's `lib/supabase/data.ts` friend section so both clients
 * write the same rows with the same meaning. The app could already *read*
 * `friend_requests` - the message inbox unions friends with DM partners - but
 * had no way to send, accept or remove one, so a friendship could only ever be
 * created on the web.
 *
 * # The shape of the table
 *
 * One row per relationship, not two. `requester_id` and `addressee_id` record
 * who asked whom, and `status` moves pending -> accepted or declined. That means
 * every read has to check *both* columns, and "who is my friend" is "the other
 * end of an accepted row" - which is why `listFriends` resolves ids before
 * fetching profiles rather than filtering a single column.
 */

import { getSupabaseClient } from '@/services/auth/supabase-client';
import type { User } from '@/types';

import { toUser, type FriendRequestRow } from './rows';
import type { ProfileRow } from '@/services/auth/types';
import { PROFILE_COLUMNS } from '@/services/auth/types';

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

/** A pending request, with the other party resolved for rendering. */
export interface PendingRequest {
  id: string;
  /** True when the caller sent it, false when they received it. */
  outgoing: boolean;
  user: User;
  createdAt: string;
}

export const friendsRepository = {
  /** Every row the caller is a party to, in either direction. */
  async listRequests(profileId: string): Promise<FriendRequestRow[]> {
    const { data, error } = await client()
      .from('friend_requests')
      .select('*')
      .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
    if (error) throw new Error(error.message);
    return (data ?? []) as FriendRequestRow[];
  },

  /** Accepted relationships, resolved to profiles. */
  async listFriends(profileId: string): Promise<User[]> {
    const rows = await this.listRequests(profileId);
    const ids = rows
      .filter((r) => r.status === 'accepted')
      .map((r) => (r.requester_id === profileId ? r.addressee_id : r.requester_id));

    if (ids.length === 0) return [];

    const { data, error } = await client()
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('id', ids);
    if (error) throw new Error(error.message);
    return ((data ?? []) as ProfileRow[]).map(toUser);
  },

  /**
   * Requests still awaiting a decision, in both directions.
   *
   * Outgoing ones are included deliberately: without them the only feedback
   * after tapping "Add friend" is the button changing, and a request that
   * silently went nowhere looks identical to one that was ignored.
   */
  async listPending(profileId: string): Promise<PendingRequest[]> {
    const rows = (await this.listRequests(profileId)).filter(
      (r) => r.status === 'pending',
    );
    if (rows.length === 0) return [];

    const otherIds = rows.map((r) =>
      r.requester_id === profileId ? r.addressee_id : r.requester_id,
    );

    const { data, error } = await client()
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('id', otherIds);
    if (error) throw new Error(error.message);

    const byId = new Map(
      ((data ?? []) as ProfileRow[]).map((p) => [p.id, toUser(p)]),
    );

    return rows
      .map((r) => {
        const outgoing = r.requester_id === profileId;
        const user = byId.get(outgoing ? r.addressee_id : r.requester_id);
        return user
          ? { id: r.id, outgoing, user, createdAt: r.created_at }
          : null;
      })
      .filter((r): r is PendingRequest => r !== null);
  },

  async send(requesterId: string, addresseeId: string): Promise<void> {
    if (requesterId === addresseeId) {
      throw new Error('You cannot add yourself.');
    }
    const { error } = await client()
      .from('friend_requests')
      .insert({ requester_id: requesterId, addressee_id: addresseeId });
    // 23505 is the unique violation: they have already asked, or been asked.
    // Saying so would leak that a request exists in the other direction, and it
    // is not a failure the sender can act on either way.
    if (error && error.code !== '23505') throw new Error(error.message);
  },

  async respond(requestId: string, accept: boolean): Promise<void> {
    const { error } = await client()
      .from('friend_requests')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', requestId);
    if (error) throw new Error(error.message);
  },

  /** Deletes the row, so the pair can start over later. */
  async remove(requestId: string): Promise<void> {
    const { error } = await client()
      .from('friend_requests')
      .delete()
      .eq('id', requestId);
    if (error) throw new Error(error.message);
  },

  /** The row id linking the caller to `otherId`, or null. Needed to remove. */
  async relationship(
    profileId: string,
    otherId: string,
  ): Promise<FriendRequestRow | null> {
    const rows = await this.listRequests(profileId);
    return (
      rows.find(
        (r) =>
          (r.requester_id === profileId && r.addressee_id === otherId) ||
          (r.addressee_id === profileId && r.requester_id === otherId),
      ) ?? null
    );
  },
};
