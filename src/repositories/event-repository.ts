/**
 * Event data access.
 *
 * Every method returns a Promise and models a single network call, so
 * replacing the mock body with `fetch(...)` or a Supabase query is a local
 * change. Filtering/sorting happens here (server-side in production) rather
 * than in the screens.
 */

import { db } from '@/mock';
import type {
  EventFilters,
  EventItem,
  Page,
  ScheduleSlot,
  User,
} from '@/types';
import { mockDelay, uid } from '@/utils';

const PAGE_SIZE = 8;

function all(): EventItem[] {
  return Object.values(db.events);
}

function startTime(e: EventItem): number {
  return new Date(e.startsAt).getTime();
}

function matchesDate(e: EventItem, filter: EventFilters['date']): boolean {
  if (filter === 'any') return true;
  const start = startTime(e);
  const now = new Date();
  const dayStart = new Date(now).setHours(0, 0, 0, 0);

  if (filter === 'today') {
    return start >= dayStart && start < dayStart + 24 * 60 * 60 * 1000;
  }
  if (filter === 'this-week') {
    return start >= dayStart && start < dayStart + 7 * 24 * 60 * 60 * 1000;
  }
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return start >= dayStart && start < monthEnd;
}

function matchesQuery(e: EventItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    e.title.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.location.toLowerCase().includes(q) ||
    e.category.toLowerCase().includes(q) ||
    e.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function applyFilters(events: EventItem[], filters: EventFilters): EventItem[] {
  const filtered = events.filter((e) => {
    if (!matchesQuery(e, filters.query)) return false;
    if (filters.categories.length && !filters.categories.includes(e.category)) {
      return false;
    }
    if (!matchesDate(e, filters.date)) return false;
    if (filters.location && e.location !== filters.location) return false;
    if (filters.onlineOnly && !e.isOnline) return false;
    if (filters.freeOnly && e.price.toLowerCase() !== 'free') return false;
    return true;
  });

  const sorted = [...filtered];
  if (filters.sort === 'soonest') {
    sorted.sort((a, b) => startTime(a) - startTime(b));
  } else if (filters.sort === 'popular') {
    sorted.sort((a, b) => b.attendeeIds.length - a.attendeeIds.length);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: EventItem['category'];
  startsAt: string;
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  price: string;
  visibility: EventItem['visibility'];
  requiresApproval: boolean;
  tokenGated: boolean;
  gateRequirement?: string;
  tags: string[];
  coverGradient: EventItem['coverGradient'];
  coverImage?: string;
  communityId?: string;
  schedule?: ScheduleSlot[];
}

export const eventRepository = {
  /** Cursor-paginated discovery feed. The cursor is an offset. */
  async list(
    filters: EventFilters,
    cursor: number | null = 0,
  ): Promise<Page<EventItem>> {
    await mockDelay();
    const matched = applyFilters(all(), filters);
    const offset = cursor ?? 0;
    const items = matched.slice(offset, offset + PAGE_SIZE);
    const next = offset + PAGE_SIZE;
    return {
      items,
      nextCursor: next < matched.length ? next : null,
      total: matched.length,
    };
  },

  async getById(id: string): Promise<EventItem | null> {
    await mockDelay();
    return db.events[id] ?? null;
  },

  /** Boosted events for the Home carousel. */
  async listFeatured(): Promise<EventItem[]> {
    await mockDelay();
    return all()
      .filter((e) => e.featured && startTime(e) > Date.now())
      .sort((a, b) => startTime(a) - startTime(b));
  },

  /** Next events on the calendar, regardless of RSVP state. */
  async listUpcoming(limit = 6): Promise<EventItem[]> {
    await mockDelay();
    return all()
      .filter((e) => startTime(e) > Date.now())
      .sort((a, b) => startTime(a) - startTime(b))
      .slice(0, limit);
  },

  /**
   * "Recommended for you" — ranked by overlap between the user's interests and
   * an event's tags/category, then by how soon it starts.
   */
  async listRecommended(user: User | null, limit = 6): Promise<EventItem[]> {
    await mockDelay();
    const interests = new Set(
      (user?.interests ?? []).map((i) => i.toLowerCase()),
    );
    return all()
      .filter((e) => startTime(e) > Date.now())
      .map((e) => {
        const haystack = [e.category, ...e.tags].map((t) => t.toLowerCase());
        const score = haystack.reduce(
          (acc, t) => acc + (interests.has(t) ? 1 : 0),
          0,
        );
        return { event: e, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score || startTime(a.event) - startTime(b.event),
      )
      .slice(0, limit)
      .map((r) => r.event);
  },

  async listByHost(hostId: string): Promise<EventItem[]> {
    await mockDelay();
    return all()
      .filter((e) => e.hostId === hostId)
      .sort((a, b) => startTime(b) - startTime(a));
  },

  async listByAttendee(userId: string): Promise<EventItem[]> {
    await mockDelay();
    return all()
      .filter((e) => e.attendeeIds.includes(userId))
      .sort((a, b) => startTime(a) - startTime(b));
  },

  async listByCommunity(communityId: string): Promise<EventItem[]> {
    await mockDelay();
    return all()
      .filter((e) => e.communityId === communityId)
      .sort((a, b) => startTime(a) - startTime(b));
  },

  /** Distinct locations, for the Discover location filter. */
  async listLocations(): Promise<string[]> {
    await mockDelay();
    return Array.from(new Set(all().map((e) => e.location))).sort();
  },

  async create(input: CreateEventInput, hostId: string): Promise<EventItem> {
    await mockDelay();
    const event: EventItem = {
      ...input,
      id: uid('e'),
      hostId,
      attendeeIds: [hostId],
      createdAt: Date.now(),
    };
    db.events[event.id] = event;
    return event;
  },

  /** Toggle RSVP and return the updated event. */
  async toggleRsvp(eventId: string, userId: string): Promise<EventItem> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) throw new Error(`Event ${eventId} not found`);
    const going = event.attendeeIds.includes(userId);
    const attendeeIds = going
      ? event.attendeeIds.filter((id) => id !== userId)
      : [...event.attendeeIds, userId];
    const next = { ...event, attendeeIds };
    db.events[eventId] = next;
    return next;
  },
};
