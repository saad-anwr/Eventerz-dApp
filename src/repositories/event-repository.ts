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
  EventGuest,
  EventItem,
  GuestPreviewEntry,
  Page,
  RsvpState,
  ScheduleSlot,
  User,
} from '@/types';
import { isLiveRsvp, mockDelay, uid } from '@/utils';

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

  /**
   * Structured location, when the host picked a place rather than typing one.
   * All optional: an event whose location a geocoder never saw is still a valid
   * event, and requiring these would make the place picker mandatory.
   */
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
}

/**
 * Fields a host may change after publishing.
 *
 * Every field optional, and undefined means "leave alone" - the RPC treats null
 * the same way. `endsAt: null` is the one exception and means "clear it", since
 * an event can legitimately lose its end time.
 */
export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: EventItem['category'];
  startsAt?: string;
  endsAt?: string | null;
  location?: string;
  isOnline?: boolean;
  capacity?: number;
  price?: string;
  visibility?: EventItem['visibility'];
  requiresApproval?: boolean;
  tags?: string[];
  coverGradient?: EventItem['coverGradient'];
  coverImage?: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  address?: string | null;
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
   * "Recommended for you" - ranked by overlap between the user's interests and
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

  /**
   * Ask to attend.
   *
   * Mirrors the outcome rules the SQL function enforces - full first, then
   * approval, else straight in - so the mock and live backends behave the same
   * way and a screen written against one works against the other.
   */
  async requestToJoin(eventId: string, userId: string): Promise<EventItem> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) throw new Error(`Event ${eventId} not found`);
    if (event.hostId === userId) {
      throw new Error('You are hosting this event.');
    }
    if (isLiveRsvp(event.myStatus)) return event;

    const going = event.confirmedCount ?? event.attendeeIds.length;
    const status: RsvpState =
      going >= event.capacity
        ? 'waitlist'
        : event.requiresApproval
          ? 'pending'
          : 'confirmed';

    const next: EventItem = {
      ...event,
      myStatus: status,
      attendeeIds:
        status === 'confirmed'
          ? [...new Set([...event.attendeeIds, userId])]
          : event.attendeeIds,
      confirmedCount: status === 'confirmed' ? going + 1 : going,
      pendingCount:
        (event.pendingCount ?? 0) + (status === 'pending' ? 1 : 0),
      waitlistCount:
        (event.waitlistCount ?? 0) + (status === 'waitlist' ? 1 : 0),
    };
    db.events[eventId] = next;
    return next;
  },

  async cancelRsvp(eventId: string, userId: string): Promise<EventItem> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) throw new Error(`Event ${eventId} not found`);

    const was = event.myStatus ?? 'confirmed';
    const next: EventItem = {
      ...event,
      myStatus: 'cancelled',
      attendeeIds: event.attendeeIds.filter((id) => id !== userId),
      confirmedCount: Math.max(
        0,
        (event.confirmedCount ?? event.attendeeIds.length) -
          (was === 'confirmed' ? 1 : 0),
      ),
      pendingCount: Math.max(
        0,
        (event.pendingCount ?? 0) - (was === 'pending' ? 1 : 0),
      ),
      waitlistCount: Math.max(
        0,
        (event.waitlistCount ?? 0) - (was === 'waitlist' ? 1 : 0),
      ),
    };
    db.events[eventId] = next;
    return next;
  },

  /**
   * Edit an event, locally.
   *
   * Unlike guest approval below, this has a faithful local model - it is the
   * host changing their own row - so it behaves rather than refusing. Undefined
   * fields are skipped so the merge matches the RPC's "null means leave alone".
   */
  async updateEvent(
    eventId: string,
    patch: UpdateEventInput,
  ): Promise<EventItem> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) throw new Error(`Event ${eventId} not found`);
    if (event.cancelledAt) {
      throw new Error('This event was cancelled and can no longer be edited.');
    }

    const going = event.confirmedCount ?? event.attendeeIds.length;
    if (patch.capacity !== undefined && patch.capacity < going) {
      throw new Error(
        `You already have ${going} confirmed guests. Remove some before lowering capacity to ${patch.capacity}.`,
      );
    }

    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );

    const next: EventItem = {
      ...event,
      ...defined,
      // `endsAt: null` means "clear it"; the spread above would leave a null in
      // a field typed `string | undefined`.
      endsAt: patch.endsAt === null ? undefined : (patch.endsAt ?? event.endsAt),
      latitude: patch.latitude ?? (patch.latitude === null ? undefined : event.latitude),
      longitude:
        patch.longitude ?? (patch.longitude === null ? undefined : event.longitude),
      placeId: patch.placeId ?? (patch.placeId === null ? undefined : event.placeId),
      address: patch.address ?? (patch.address === null ? undefined : event.address),
    };

    db.events[eventId] = next;
    return next;
  },

  async cancelEvent(eventId: string, reason?: string): Promise<EventItem> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) throw new Error(`Event ${eventId} not found`);
    if (event.cancelledAt) return event;

    const next: EventItem = {
      ...event,
      cancelledAt: new Date().toISOString(),
      cancelReason: reason?.trim() || undefined,
      // Mirrors `cancel_event`: every live RSVP is closed.
      myStatus: event.myStatus ? 'cancelled' : undefined,
    };
    db.events[eventId] = next;
    return next;
  },

  /*
   * Host-side moderation has no meaningful local model: the mock has one user,
   * so there is no second party to approve. These exist so the two repositories
   * share a shape, and they refuse rather than pretending to have done
   * something.
   */
  async approveGuest(eventId: string): Promise<EventItem> {
    throw new Error(
      'Approving guests is unavailable in this build.',
    );
  },

  async declineGuest(eventId: string): Promise<EventItem> {
    throw new Error(
      'Approving guests is unavailable in this build.',
    );
  },

  /** In the mock every roster entry is a confirmed guest. */
  async listGuests(eventId: string): Promise<EventGuest[]> {
    await mockDelay();
    const event = db.events[eventId];
    if (!event) return [];
    return event.attendeeIds.flatMap((id) => {
      const user = db.users[id];
      if (!user) return [];
      return [
        {
          eventId,
          profileId: id,
          status: 'confirmed' as RsvpState,
          name: user.name,
          handle: user.handle,
          walletAddress: user.walletAddress,
          reputation: user.reputation,
          createdAt: event.createdAt,
        },
      ];
    });
  },

  async guestPreview(
    eventId: string,
    limit = 3,
  ): Promise<GuestPreviewEntry[]> {
    const guests = await eventRepository.listGuests(eventId);
    return guests.slice(0, limit).map((g) => ({ id: g.profileId, name: g.name }));
  },
};
