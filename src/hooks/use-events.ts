/**
 * Event queries and mutations.
 *
 * Screens consume these - never the repository directly - so caching,
 * invalidation and optimistic updates stay in one place.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { integrationsConfig } from '@/constants/config';
import {
  eventRepository,
  userRepository,
  type CreateEventInput,
  type UpdateEventInput,
} from '@/repositories';
import { AnalyticsEvent, analytics, notificationService, solanaService } from '@/services';
import {
  isRemoteUri,
  uploadEventBanner,
} from '@/repositories/supabase/banners';
import { toast } from '@/store/toast-store';
import { priceToLamports } from '@/utils/amount';
import { assertRealIdentity } from '@/utils/identity';
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

/* -------------------------------------------------------------------------- */
/*  Guest state - request, cancel, and the host's decision                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything that changes guest state invalidates the same keys, so a host
 * approving someone updates that guest's own view of the event, the counters on
 * every card and the guest list together.
 */
function useGuestStateInvalidation() {
  const queryClient = useQueryClient();
  return (updated?: EventItem) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    if (updated) {
      queryClient.setQueryData(queryKeys.events.detail(updated.id), updated);
    }
  };
}

/**
 * Ask to attend.
 *
 * The server decides the outcome - confirmed, pending approval, or waitlisted -
 * so this deliberately does *not* update optimistically. The old version
 * assumed "not going -> going" and flipped the button immediately, which showed
 * "You're going" for an event that had actually queued a pending request or
 * refused the call outright.
 */
export function useRequestToJoin() {
  const invalidate = useGuestStateInvalidation();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (event: EventItem) => {
      if (!user) throw new Error('Sign in to RSVP.');

      /*
       * Only attempt a signature when a program is actually deployed. The
       * on-chain step is additive: RSVPs are real records in Postgres, and
       * gating them on a program that does not exist yet would break the
       * feature for no benefit.
       */
      if (integrationsConfig.programId) {
        /*
         * The host's wallet is part of the instruction: a paid event settles
         * the price to them inside `claim_seat`. A host who has not linked one
         * has no on-chain seats, which is correct rather than an error - the
         * database RSVP below still happens, and that is the record that
         * matters.
         */
        const host = await userRepository.getById(event.hostId);
        if (host?.walletAddress) {
          await solanaService.rsvp(event.id, host.walletAddress);
        }
      }

      const updated = await eventRepository.requestToJoin(event.id, user.id);

      // Reminders only make sense once a seat is actually held.
      if (updated.myStatus === 'confirmed') {
        await notificationService.scheduleEventReminders(updated);
      }

      analytics.track(AnalyticsEvent.EventRsvp, {
        eventId: event.id,
        status: updated.myStatus ?? 'unknown',
      });
      return updated;
    },
    onSuccess: invalidate,
  });
}

export function useCancelRsvp() {
  const invalidate = useGuestStateInvalidation();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (event: EventItem) => {
      if (!user) throw new Error('Sign in first.');
      await notificationService.cancelEventReminders(event.id);
      return eventRepository.cancelRsvp(event.id, user.id);
    },
    onSuccess: invalidate,
  });
}

export function useApproveGuest() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (vars: { eventId: string; profileId: string }) =>
      eventRepository.approveGuest(vars.eventId, vars.profileId),
    onSuccess: invalidate,
  });
}

export function useDeclineGuest() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (vars: { eventId: string; profileId: string }) =>
      eventRepository.declineGuest(vars.eventId, vars.profileId),
    onSuccess: invalidate,
  });
}

/** Full roster. Comes back empty unless the viewer is the host or confirmed. */
export function useEventGuests(eventId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.guests.list(eventId ?? ''),
    queryFn: () => eventRepository.listGuests(eventId!),
    enabled: Boolean(eventId),
  });
}

/**
 * A few faces for viewers who cannot read the roster.
 *
 * `limit` is in the key. It used to be left out, which was harmless only
 * because every caller passed 3 - two components wanting different sample sizes
 * would have shared one cache entry and the second would have silently rendered
 * the first's result.
 */
export function useGuestPreview(eventId: string | undefined, limit = 3) {
  return useQuery({
    queryKey: queryKeys.guests.preview(eventId ?? '', limit),
    queryFn: () => eventRepository.guestPreview(eventId!, limit),
    enabled: Boolean(eventId),
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------------------------- */
/*  Host-side event lifecycle                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Save a host's edits.
 *
 * Invalidates notifications too: a move or a time change writes one to every
 * live guest, and the host is often looking at their own bell when it lands.
 */
export function useUpdateEvent(eventId: string | undefined) {
  const invalidate = useGuestStateInvalidation();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (patch: UpdateEventInput) => {
      if (!eventId) throw new Error('No event to update.');

      /*
       * Same upload step as publishing. The edit form re-submits whatever
       * `coverImage` currently holds, so an untouched banner arrives as the
       * public URL we stored last time - `isRemoteUri` is what stops that being
       * re-uploaded on every save, copying the object and orphaning the old one.
       */
      let next = patch;
      if (patch.coverImage && !isRemoteUri(patch.coverImage) && user) {
        assertRealIdentity(user.id);
        next = {
          ...patch,
          coverImage: await uploadEventBanner(user.id, patch.coverImage),
        };
      }

      return eventRepository.updateEvent(eventId, next);
    },
    onSuccess: invalidate,
  });
}

/**
 * Call an event off.
 *
 * Also cancels this device's scheduled local reminders. Without that, the phone
 * would still buzz "starts in an hour" for an event that is not happening - the
 * notification is queued in the OS and knows nothing about the database.
 */
export function useCancelEvent(eventId: string | undefined) {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: async (reason?: string) => {
      if (!eventId) throw new Error('No event to cancel.');
      const updated = await eventRepository.cancelEvent(eventId, reason);
      await notificationService.cancelEventReminders(eventId);
      return updated;
    },
    onSuccess: invalidate,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      if (!user) throw new Error('Connect a wallet to publish an event.');

      /*
       * A wallet nobody has linked yet holds a provisional `wallet:<address>`
       * id. Sending that to `events.host_id` produced the raw Postgres error
       * users actually saw:
       *
       *     Could not publish
       *     invalid input syntax for type uuid: "wallet:CiM2ZRkc..."
       *
       * The store no longer *creates* that situation while signed in (see
       * `resolveIdentity`), but the guard stays: it is the difference between a
       * signed-out user being told what to do and being shown a type error from
       * the database.
       */
      assertRealIdentity(user.id);

      /*
       * The picker hands back a device-local `file://` URI. Storing that is
       * what made a banner visible in the wizard preview and nowhere else - see
       * `uploadEventBanner`. Upload first, then write the public URL.
       *
       * A failed upload must not cost the user the event they just filled in
       * six steps of, so it degrades to the gradient rather than aborting the
       * publish. The gradient is the designed fallback, not a broken state.
       */
      let coverImage = input.coverImage;
      if (coverImage && !isRemoteUri(coverImage)) {
        try {
          coverImage = await uploadEventBanner(user.id, coverImage);
        } catch (error) {
          coverImage = undefined;
          // Say so. Publishing an event whose banner quietly vanished is how
          // the original bug felt from the outside, and repeating that while
          // technically succeeding would be no better.
          toast.info(
            'Banner could not be uploaded',
            error instanceof Error
              ? `${error.message} The event was published with its gradient cover - you can add a banner by editing it.`
              : 'The event was published with its gradient cover instead.',
          );
        }
      }

      const event = await eventRepository.create(
        { ...input, coverImage },
        user.id,
      );

      /*
       * Publish the account with the event's real terms.
       *
       * These are not decoration: `capacity` bounds how many seats exist and
       * `startsAt`/`endsAt` bound the window in which any seat can be claimed.
       * Publishing with placeholders writes an event that is already over.
       *
       * Only attempted when a program is deployed - the database row is the
       * record either way, and refusing to create an event because no program
       * exists would break a working feature to protect a promise nobody made.
       */
      if (integrationsConfig.programId) {
        await solanaService.createEvent({
          eventId: event.id,
          capacity: event.capacity,
          startsAt: event.startsAt,
          endsAt: event.endsAt ?? null,
          requiresApproval: event.requiresApproval,
          priceLamports: priceToLamports(event.price),
        });
      }

      analytics.track(AnalyticsEvent.EventCreated, { eventId: event.id });
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}
