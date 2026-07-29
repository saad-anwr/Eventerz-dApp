/**
 * In-memory mock database.
 *
 * Repositories read and write through this module and nothing else, so the day
 * a real API arrives only `repositories/*.ts` change — screens, hooks and
 * stores are untouched.
 */

import type {
  AppNotification,
  Community,
  EventItem,
  Registration,
  Ticket,
  User,
} from '@/types';

import { mockCommunities } from './communities';
import { buildMockEvents } from './events';
import { buildMockNotifications } from './notifications';
import { buildMockRegistrations } from './analytics';
import { mockUsers } from './users';

interface MockDatabase {
  users: Record<string, User>;
  events: Record<string, EventItem>;
  communities: Record<string, Community>;
  notifications: AppNotification[];
  registrations: Registration[];
  tickets: Record<string, Ticket>;
}

function seed(): MockDatabase {
  const users: Record<string, User> = {};
  mockUsers.forEach((u) => {
    users[u.id] = u;
  });

  const events: Record<string, EventItem> = {};
  buildMockEvents().forEach((e) => {
    events[e.id] = e;
  });

  const communities: Record<string, Community> = {};
  mockCommunities.forEach((c) => {
    communities[c.id] = c;
  });

  return {
    users,
    events,
    communities,
    notifications: buildMockNotifications(),
    registrations: buildMockRegistrations(),
    tickets: {},
  };
}

export const db: MockDatabase = seed();

/** Reset to pristine seed data — used by Settings → "Reset demo data". */
export function resetMockDatabase(): void {
  const fresh = seed();
  db.users = fresh.users;
  db.events = fresh.events;
  db.communities = fresh.communities;
  db.notifications = fresh.notifications;
  db.registrations = fresh.registrations;
  db.tickets = fresh.tickets;
}

export * from './users';
export * from './events';
export * from './communities';
export * from './tickets';
export * from './notifications';
export * from './analytics';
export * from './onboarding';
