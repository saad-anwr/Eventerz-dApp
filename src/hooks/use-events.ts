/**
 * Event queries and mutations.
 *
 * Screens consume these — never the repository directly — so caching,
 * invalidation and optimistic updates stay in one place.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { integrationsConfig } from '@/constants/config';
import { eventRepository, type CreateEventInput } from '@/repositories';
import { AnalyticsEvent, analytics, notificationService, solanaService } from '@/services';
import { useWalletStore } from '@/store/wallet-store';
import type { EventFilters, EventItem } from '@/types';

import { queryKeys } from './query-keys';

export function useEventsFeed(filters: EventFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.events.list(filters),
    queryFn: ({ pageParam }) => eventRepository.list(filters, pageParam),
    initialPageParam: 0 as number | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? ''),
    queryFn: () => eventRepository.getById(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useFeaturedEvents() {
  return useQuery({
    queryKey: queryKeys.events.featured(),
    queryFn: () => eventRepository.listFeatured(),
    staleTime: 60_000,
  });
}

export function useUpcomingEvents(limit = 6) {
  return useQuery({
    queryKey: queryKeys.events.upcoming(),
    queryFn: () => eventRepository.listUpcoming(limit),
    staleTime: 60_000,
  });
}

export function useRecommendedEvents(limit = 6) {
  const user = useWalletStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.events.recommended(user?.id ?? null),
    queryFn: () => eventRepository.listRecommended(user, limit),
    staleTime: 60_000,
  });
}

export function useEventsByHost(hostId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.events.byHost(hostId ?? ''),
    queryFn: () => eventRepository.listByHost(hostId!),
    enabled: Boolean(hostId),
  });
}

export function useEventsByAttendee(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.events.byAttendee(userId ?? ''),
    queryFn: () => eventRepository.listByAttendee(userId!),
    enabled: Boolean(userId),
  });
}

export function useEventsByCommunity(communityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.events.byCommunity(communityId ?? ''),
    queryFn: () => eventRepository.listByCommunity(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useEventLocations() {
  return useQuery({
    queryKey: queryKeys.events.locations(),
    queryFn: () => eventRepository.listLocations(),
    staleTime: 5 * 60_000,
  });
}

/**
 * RSVP toggle.
 *
 * Going: signs an on-chain RSVP, then mints the NFT ticket.
 * Cancelling: revokes the ticket. The event list is updated optimistically so
 * the button flips instantly; a failure rolls the cache back.
 */
export function useToggleRsvp() {
  const queryClient = useQueryClient();
  const account = useWalletStore((s) => s.account);
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (event: EventItem) => {
      if (!user || !account) {
        throw new Error('Connect a wallet to RSVP.');
      }
      const wasGoing = event.attendeeIds.includes(user.id);

      /*
       * Ticket lifecycle lives with the RSVP: on Supabase the `rsvp()` /
       * `cancel_rsvp()` functions allocate and revoke the ticket atomically
       * (capacity and serial numbering are races otherwise), and the mock
       * repository mirrors that. So this hook only sequences the on-chain step
       * around it.
       */
      if (wasGoing) {
        await notificationService.cancelEventReminders(event.id);
      } else if (integrationsConfig.programId) {
        // Only attempt a signature when a program is actually deployed —
        // otherwise the adapter throws and the RSVP would fail for no reason.
        await solanaService.rsvp(event.id);
      }

      const updated = await eventRepository.toggleRsvp(event.id, user.id);

      if (!wasGoing) await notificationService.scheduleEventReminders(event);
      analytics.track(AnalyticsEvent.EventRsvp, {
        eventId: event.id,
        going: !wasGoing,
      });
      return { updated, wasGoing };
    },

    onMutate: async (event) => {
      if (!user) return;
      const key = queryKeys.events.detail(event.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<EventItem>(key);
      const going = event.attendeeIds.includes(user.id);
      queryClient.setQueryData<EventItem>(key, {
        ...event,
        attendeeIds: going
          ? event.attendeeIds.filter((id) => id !== user.id)
          : [...event.attendeeIds, user.id],
      });
      return { previous, key };
    },

    onError: (_error, _event, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },

    onSettled: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      if (result) {
        queryClient.setQueryData(
          queryKeys.events.detail(result.updated.id),
          result.updated,
        );
      }
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      if (!user) throw new Error('Connect a wallet to publish an event.');
      const event = await eventRepository.create(input, user.id);
      await solanaService.createEvent(event.id);
      analytics.track(AnalyticsEvent.EventCreated, { eventId: event.id });
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}
