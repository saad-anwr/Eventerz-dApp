/**
 * Realtime sync.
 *
 * Subscribes to Postgres changes and invalidates the matching React Query keys,
 * so a change made on the website — or by another user — lands here without a
 * pull-to-refresh. The website runs the same subscription against the same
 * tables, which is what keeps the two clients in step.
 *
 * A table only streams if it is in the `supabase_realtime` publication;
 * migration 0003 adds all of them. Without that the channel subscribes happily
 * and then stays silent, which is a confusing way to fail.
 *
 * Inert when Supabase is unconfigured or the mock backend is in use.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMockBackend } from '@/repositories';
import { getSupabaseClient } from '@/services/auth/supabase-client';

import { queryKeys } from './query-keys';

export function useRealtimeSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (useMockBackend) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('eventerz-mobile-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps' },
        () => {
          /*
           * Counts ride on the `events` row (maintained by trigger in 0005), so
           * the event keys cover the numbers. The guest keys cover the roster
           * and preview — which is what a host watching their approval queue is
           * looking at while someone else asks to join.
           */
          queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          // Check-in flips a ticket, which moves `checked_in_count`.
          queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.all,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'communities' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.communities.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_members' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.communities.all });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
