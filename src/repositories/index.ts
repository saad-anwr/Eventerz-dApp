/**
 * Repository selection.
 *
 * One decision point for the whole app: Supabase by default, the in-memory mock
 * only when `EXPO_PUBLIC_USE_MOCK_DATA=true`. Hooks and screens import from
 * here and never learn which backend answered.
 *
 * The mock is retained deliberately — it keeps the UI runnable with no network,
 * which is what lets a fresh clone start and makes offline UI work possible.
 */

import { featureFlags } from '@/constants/config';
import { isSupabaseConfigured } from '@/services/auth/supabase-client';

import { analyticsRepository as mockAnalyticsRepository } from './analytics-repository';
import { communityRepository as mockCommunityRepository } from './community-repository';
import { eventRepository as mockEventRepository } from './event-repository';
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

/**
 * Fall back to the mock when Supabase is unconfigured even if the flag says
 * otherwise — an unconfigured build should show seed data, not throw on every
 * screen.
 */
export const useMockBackend = featureFlags.useMockData || !isSupabaseConfigured;

export const eventRepository = useMockBackend
  ? mockEventRepository
  : supabaseEventRepository;

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

export type { CreateEventInput } from './event-repository';
