/**
 * Messages and in-chat payments, Supabase-backed.
 *
 * Mirrors the website's `lib/supabase/data.ts` message and payment sections so
 * both clients hit the same tables with the same semantics — a receipt sent
 * from the app has to render identically on the web, because it is the same
 * row.
 */

import { getSupabaseClient } from '@/services/auth/supabase-client';
import type { Conversation, Message, PaymentReceipt, User } from '@/types';

import {
  toMessage,
  toPaymentReceipt,
  toUser,
  type FriendRequestRow,
  type MessageRow,
  type PaymentRow,
} from './rows';
import type { ProfileRow } from '@/services/auth/types';

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

function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ?? `${context} failed.`);
}

/**
 * Canonical DM channel key.
 *
 * Sorted so both participants derive the same string from either direction —
 * `can_access_channel` checks membership by looking for the caller's id inside
 * this key, so an unsorted variant would produce two channels for one
 * conversation and split it in half.
 */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('__')}`;
}

export const supabaseMessageRepository = {
  /**
   * The inbox: friends **union** everyone who has actually messaged the viewer.
   *
   * Friends alone was the old rule, and it meant a host contacted through
   * "Contact host" — by definition not yet a friend — got the message delivered
   * to a thread that appeared nowhere. Friends with no messages are still
   * listed: an empty thread with someone you know is a starting point.
   */
  async listConversations(profileId: string): Promise<Conversation[]> {
    const supabase = client();

    const [{ data: friendRows }, { data: partners }] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('*')
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`),
      supabase.rpc('my_dm_partners'),
    ]);

    const friendIds = ((friendRows ?? []) as FriendRequestRow[])
      .filter((r) => r.status === 'accepted')
      .map((r) => (r.requester_id === profileId ? r.addressee_id : r.requester_id));

    const ids = new Set(friendIds);
    ((partners ?? []) as { profile_id: string }[]).forEach((p) => {
      if (p.profile_id && p.profile_id !== profileId) ids.add(p.profile_id);
    });
    if (ids.size === 0) return [];

    const idList = Array.from(ids);
    const channels = idList.map((id) => dmChannelId(profileId, id));

    const [{ data: profiles }, { data: messages }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', idList),
      supabase
        .from('messages')
        .select('*')
        .in('channel_id', channels)
        .order('created_at', { ascending: false }),
    ]);

    const userById = new Map<string, User>(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, toUser(p)]),
    );

    // Rows arrive newest-first, so the first hit per channel is the latest.
    const latest = new Map<string, Message>();
    ((messages ?? []) as MessageRow[]).forEach((row) => {
      if (!latest.has(row.channel_id)) latest.set(row.channel_id, toMessage(row));
    });

    const friendSet = new Set(friendIds);

    return idList
      .map((id) => userById.get(id))
      .filter((user): user is User => Boolean(user))
      .map((user) => ({
        user,
        last: latest.get(dmChannelId(profileId, user.id)),
        isFriend: friendSet.has(user.id),
      }))
      .sort((a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0));
  },

  async listMessages(channelId: string): Promise<Message[]> {
    const { data, error } = await client()
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) fail('Loading messages', error);
    return ((data ?? []) as MessageRow[]).map(toMessage);
  },

  async send(
    channelId: string,
    senderId: string,
    body: string,
    scope: 'event' | 'dm' = 'dm',
  ): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) return;

    const { error } = await client()
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: senderId,
        body: trimmed,
        scope,
      });
    if (error) fail('Sending the message', error);
  },

  /** Receipts referenced by a thread's messages. */
  async listPayments(ids: string[]): Promise<PaymentReceipt[]> {
    if (ids.length === 0) return [];
    const { data, error } = await client()
      .from('payments')
      .select('*')
      .in('id', ids);
    if (error) fail('Loading receipts', error);
    return ((data ?? []) as PaymentRow[]).map(toPaymentReceipt);
  },

  /**
   * File the receipt for a transfer that has already confirmed on-chain.
   *
   * Called after the cluster has accepted the transaction, never before: a
   * receipt for a transfer that has not landed is a lie the recipient acts on.
   * Idempotent on the signature, so retrying after a dropped connection files it
   * exactly once.
   */
  async recordPayment(input: {
    signature: string;
    toWallet: string;
    amount: bigint;
    channelId?: string;
    toProfile?: string;
    memo?: string;
    cluster?: string;
  }): Promise<PaymentReceipt> {
    const { data, error } = await client().rpc('record_payment', {
      p_signature: input.signature,
      p_to_wallet: input.toWallet,
      // A numeric string is the only way to send a value above 2^53 to a
      // Postgres `bigint` without losing precision on the way.
      p_amount: input.amount.toString(),
      p_channel_id: input.channelId ?? null,
      p_to_profile: input.toProfile ?? null,
      p_memo: input.memo ?? null,
      p_mint: null,
      p_symbol: 'SOL',
      p_decimals: 9,
      p_cluster: input.cluster ?? 'mainnet-beta',
    });

    if (error) fail('Saving the receipt', error);
    return toPaymentReceipt(data as PaymentRow);
  },

  /**
   * Ask the Edge Function to check a receipt against the cluster.
   *
   * Best-effort. An unverified receipt renders with its explorer link and no
   * tick, which is honest and useful; blocking on an RPC that may not have seen
   * the transaction yet is neither.
   */
  async verifyPayment(signature: string): Promise<boolean> {
    try {
      const { data, error } = await client().functions.invoke('verify-payment', {
        body: { signature },
      });
      if (error) return false;
      return Boolean((data as { verified?: boolean } | null)?.verified);
    } catch {
      return false;
    }
  },
};
