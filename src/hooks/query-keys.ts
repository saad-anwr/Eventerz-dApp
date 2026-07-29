/**
 * Query key factory.
 *
 * Centralised so invalidation is precise — `queryKeys.events.all` invalidates
 * every event list without touching tickets or the profile.
 */

import type { EventFilters } from '@/types';

export const queryKeys = {
  events: {
    all: ['events'] as const,
    list: (filters: EventFilters) => ['events', 'list', filters] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
    featured: () => ['events', 'featured'] as const,
    upcoming: () => ['events', 'upcoming'] as const,
    recommended: (userId: string | null) =>
      ['events', 'recommended', userId] as const,
    byHost: (hostId: string) => ['events', 'by-host', hostId] as const,
    byAttendee: (userId: string) => ['events', 'by-attendee', userId] as const,
    byCommunity: (id: string) => ['events', 'by-community', id] as const,
    locations: () => ['events', 'locations'] as const,
  },
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    many: (ids: string[]) => ['users', 'many', ids] as const,
    search: (query: string) => ['users', 'search', query] as const,
  },
  tickets: {
    all: ['tickets'] as const,
    byOwner: (ownerId: string) => ['tickets', 'by-owner', ownerId] as const,
    detail: (id: string) => ['tickets', 'detail', id] as const,
    forEvent: (eventId: string, ownerId: string) =>
      ['tickets', 'for-event', eventId, ownerId] as const,
    badges: (ownerId: string) => ['tickets', 'badges', ownerId] as const,
  },
  communities: {
    all: ['communities'] as const,
    list: () => ['communities', 'list'] as const,
    trending: () => ['communities', 'trending'] as const,
    detail: (id: string) => ['communities', 'detail', id] as const,
    byMember: (userId: string) => ['communities', 'by-member', userId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    organizerStats: (hostId: string) =>
      ['analytics', 'organizer-stats', hostId] as const,
    mints: () => ['analytics', 'mints'] as const,
    attendance: () => ['analytics', 'attendance'] as const,
    registrations: () => ['analytics', 'registrations'] as const,
  },
} as const;
