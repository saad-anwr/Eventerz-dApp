/**
 * Messaging and in-chat payments.
 *
 * Screens read through these rather than touching the repository, so caching,
 * invalidation and the realtime wiring stay in one place - the same rule the
 * event hooks follow.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { messageRepository } from '@/repositories';
import { getSupabaseClient } from '@/services/auth/supabase-client';
import type { Message } from '@/types';

import { queryKeys } from './query-keys';

export function useConversations(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.messages.conversations(profileId ?? ''),
    queryFn: () => messageRepository.listConversations(profileId!),
    enabled: Boolean(profileId),
    staleTime: 15_000,
  });
}

export function useMessages(channelId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages.thread(channelId ?? ''),
    queryFn: () => messageRepository.listMessages(channelId!),
    enabled: Boolean(channelId),
  });
}

export function useSendMessage(
  channelId: string | null,
  senderId: string | undefined,
  scope: 'event' | 'dm' = 'dm',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!channelId || !senderId) throw new Error('Sign in to send messages.');
      return messageRepository.send(channelId, senderId, body, scope);
    },
    onSuccess: () => {
      if (channelId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.thread(channelId),
        });
      }
      // The inbox orders by last message, so it has to move too.
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
    },
  });
}

/**
 * The receipts a thread's messages point at.
 *
 * Driven by the ids already in the message list, so a thread with no payments in
 * it makes no request at all.
 */
export function usePayments(channelId: string | null, paymentIds: string[]) {
  return useQuery({
    queryKey: queryKeys.messages.payments(channelId ?? '', paymentIds),
    queryFn: () => messageRepository.listPayments(paymentIds),
    enabled: paymentIds.length > 0,
    staleTime: 30_000,
  });
}

/** Payment ids referenced by a set of messages, deduplicated and stable. */
export function usePaymentIds(messages: Message[]): string[] {
  return useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .map((m) => m.paymentId)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [messages],
  );
}

/**
 * File a receipt for a transfer that has already confirmed on-chain.
 *
 * Verification is fired off but not awaited. The receipt is useful the moment it
 * exists - it carries an explorer link - and making the user watch a spinner
 * while an RPC catches up with a transaction they already saw confirm would be
 * waiting for nothing. The tick arrives over Realtime when the Edge Function is
 * done.
 */
export function useRecordPayment(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      signature: string;
      toWallet: string;
      amount: bigint;
      toProfile?: string;
      memo?: string;
      cluster?: string;
    }) => {
      const payment = await messageRepository.recordPayment({
        ...input,
        channelId: channelId ?? undefined,
      });
      void messageRepository.verifyPayment(payment.signature);
      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * Live subscription for one chat channel.
 *
 * Scoped to the channel rather than folded into the global sync: chat is
 * high-frequency, and subscribing to every message in the database to render one
 * thread would leak other people's activity into this client and wake it for
 * conversations it is not showing.
 *
 * Also listens on `payments`, so a receipt flipping to verified re-renders the
 * tick without the user reopening the thread. RLS on that table means the event
 * only ever fires for the two parties.
 */
export function useRealtimeMessages(channelId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channelId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.messages.thread(channelId),
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, queryClient]);
}
