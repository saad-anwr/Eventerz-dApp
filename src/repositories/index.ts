/**
 * Repository selection.
 *
 * One decision point for the whole app: Supabase by default, the in-memory mock
 * only when `EXPO_PUBLIC_USE_MOCK_DATA=true`. Hooks and screens import from
 * here and never learn which backend answered.
 *
 * The mock is retained deliberately - it keeps the UI runnable with no network,
 * which is what lets a fresh clone start and makes offline UI work possible.
 */

import { featureFlags } from '@/constants/config';
import { isSupabaseConfigured } from '@/services/auth/supabase-client';

import { analyticsRepository as mockAnalyticsRepository } from './analytics-repository';
import { communityRepository as mockCommunityRepository } from './community-repository';
import {
  eventRepository as mockEventRepository,
  type UpdateEventInput,
} from './event-repository';
import { messageRepository as mockMessageRepository } from './message-repository';
import { notificationRepository as mockNotificationRepository } from './notification-repository';
import { ticketRepository as mockTicketRepository } from './ticket-repository';
import { userRepository as mockUserRepository } from './user-repository';

import {
  supabaseAnalyticsRepository,
  supabaseCommunityRepository,
  supabaseEventRepository,
  supabaseNotificationRepository,
  supabaseTicketRepository,
  supabaseUserRepository,
} from './supabase';
import { supabaseMessageRepository } from './supabase/messages';

/**
 * Fall back to the mock when Supabase is unconfigured even if the flag says
 * otherwise - an unconfigured build should show seed data, not throw on every
 * screen.
 */
export const useMockBackend = featureFlags.useMockData || !isSupabaseConfigured;

const activeEventRepository = useMockBackend
  ? mockEventRepository
  : supabaseEventRepository;

/**
 * Events, with the guest-state methods behind a facade.
 *
 * The two backends disagree about who the caller is: the mock has to be told
 * (`userId`), while Supabase reads `auth.uid()` server-side and would ignore
 * anything the client passed - trusting a client-supplied id there would be a
 * hole, not a convenience. Same reason the ticket facade below exists: callers
 * get one signature and the difference stays here.
 */
export const eventRepository = {
  ...activeEventRepository,

  requestToJoin: (eventId: string, userId: string) =>
    useMockBackend
      ? mockEventRepository.requestToJoin(eventId, userId)
      : supabaseEventRepository.requestToJoin(eventId),

  cancelRsvp: (eventId: string, userId: string) =>
    useMockBackend
      ? mockEventRepository.cancelRsvp(eventId, userId)
      : supabaseEventRepository.cancelRsvp(eventId),

  approveGuest: (eventId: string, profileId: string) =>
    useMockBackend
      ? mockEventRepository.approveGuest(eventId)
      : supabaseEventRepository.approveGuest(eventId, profileId),

  declineGuest: (eventId: string, profileId: string) =>
    useMockBackend
      ? mockEventRepository.declineGuest(eventId)
      : supabaseEventRepository.declineGuest(eventId, profileId),

  listGuests: (eventId: string) =>
    useMockBackend
      ? mockEventRepository.listGuests(eventId)
      : supabaseEventRepository.listGuests(eventId),

  guestPreview: (eventId: string, limit?: number) =>
    useMockBackend
      ? mockEventRepository.guestPreview(eventId, limit)
      : supabaseEventRepository.guestPreview(eventId, limit),

  updateEvent: (eventId: string, patch: UpdateEventInput) =>
    useMockBackend
      ? mockEventRepository.updateEvent(eventId, patch)
      : supabaseEventRepository.updateEvent(eventId, patch),

  cancelEvent: (eventId: string, reason?: string) =>
    useMockBackend
      ? mockEventRepository.cancelEvent(eventId, reason)
      : supabaseEventRepository.cancelEvent(eventId, reason),
};

export const messageRepository = useMockBackend
  ? mockMessageRepository
  : supabaseMessageRepository;

export const userRepository = useMockBackend
  ? mockUserRepository
  : supabaseUserRepository;

export const communityRepository = useMockBackend
  ? mockCommunityRepository
  : supabaseCommunityRepository;

export const notificationRepository = useMockBackend
  ? mockNotificationRepository
  : supabaseNotificationRepository;

export const analyticsRepository = useMockBackend
  ? mockAnalyticsRepository
  : supabaseAnalyticsRepository;

/**
 * Tickets differ between backends: the mock needs a wallet address to fabricate
 * a QR payload, while Supabase issues a server-side secret. This facade hides
 * the difference so callers have one signature.
 */
export const ticketRepository = {
  listByOwner: (ownerId: string, ownerAddress: string) =>
    useMockBackend
      ? mockTicketRepository.listByOwner(ownerId, ownerAddress)
      : supabaseTicketRepository.listByOwner(ownerId),

  getById: (id: string) =>
    useMockBackend
      ? mockTicketRepository.getById(id)
      : supabaseTicketRepository.getById(id),

  getByEvent: (eventId: string, ownerId: string) =>
    useMockBackend
      ? mockTicketRepository.getByEvent(eventId, ownerId)
      : supabaseTicketRepository.getByEvent(eventId, ownerId),

  redeemQr: (payload: string) =>
    useMockBackend
      ? mockTicketRepository.redeemQr(payload)
      : supabaseTicketRepository.redeemQr(payload),

  listBadges: (ownerId: string) =>
    useMockBackend
      ? mockTicketRepository.listBadges(ownerId)
      : supabaseTicketRepository.listBadges(ownerId),
};

/**
 * The DM channel key, re-exported from one place.
 *
 * Both backends derive it identically - sorted, so either participant computes
 * the same string - and `can_access_channel` checks membership by looking for
 * the caller's id inside it. An unsorted variant would produce two channels for
 * one conversation and silently split it in half, so there is exactly one
 * implementation and screens import it from here.
 */
export { dmChannelId } from './supabase/messages';

export type { CreateEventInput, UpdateEventInput } from './event-repository';
