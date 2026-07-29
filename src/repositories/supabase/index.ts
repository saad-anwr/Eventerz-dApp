/**
 * Supabase-backed repositories.
 *
 * Same shape as the mock repositories — `repositories/index.ts` picks between
 * them from one flag, so screens and hooks never learn which is in play.
 */

import { getSupabaseClient } from '@/services/auth/supabase-client';
import type {
  AnalyticsPoint,
  AppNotification,
  Community,
  EventFilters,
  EventItem,
  OrganizerStats,
  Page,
  Registration,
  Ticket,
  User,
} from '@/types';

import type { CreateEventInput } from '../event-repository';
import {
  parseQrPayload,
  toCommunity,
  toEventItem,
  toNotification,
  toTicket,
  toUser,
  type CommunityRow,
  type EventRow,
  type NotificationRow,
  type TicketRow,
} from './rows';

const PAGE_SIZE = 8;

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY, or set EXPO_PUBLIC_USE_MOCK_DATA=true.',
    );
  }
  return supabase;
}

/** Turn a PostgREST error into something worth showing a user. */
function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ?? `${context} failed.`);
}

/** Roster for a set of events, in one round trip rather than N. */
async function attendeesFor(
  eventIds: string[],
): Promise<Record<string, string[]>> {
  if (eventIds.length === 0) return {};

  const { data } = await client()
    .from('rsvps')
    .select('event_id, profile_id')
    .in('event_id', eventIds)
    .neq('status', 'cancelled');

  const map: Record<string, string[]> = {};
  (data ?? []).forEach((row) => {
    const r = row as { event_id: string; profile_id: string };
    (map[r.event_id] ??= []).push(r.profile_id);
  });
  return map;
}

async function hydrate(rows: EventRow[]): Promise<EventItem[]> {
  const roster = await attendeesFor(rows.map((r) => r.id));
  return rows.map((row) => toEventItem(row, roster[row.id] ?? []));
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

export const supabaseEventRepository = {
  async list(
    filters: EventFilters,
    cursor: number | null = 0,
  ): Promise<Page<EventItem>> {
    const offset = cursor ?? 0;

    let query = client()
      .from('events')
      .select('*', { count: 'exact' })
      .gte('starts_at', new Date().toISOString());

    if (filters.query.trim()) {
      const q = `%${filters.query.trim()}%`;
      query = query.or(
        `title.ilike.${q},description.ilike.${q},location.ilike.${q}`,
      );
    }
    if (filters.categories.length) {
      query = query.in('category', filters.categories);
    }
    if (filters.location) query = query.eq('location', filters.location);
    if (filters.onlineOnly) query = query.eq('is_online', true);
    if (filters.freeOnly) query = query.eq('price', 'Free');

    if (filters.date !== 'any') {
      const now = new Date();
      const end = new Date(now);
      if (filters.date === 'today') end.setDate(end.getDate() + 1);
      else if (filters.date === 'this-week') end.setDate(end.getDate() + 7);
      else end.setMonth(end.getMonth() + 1);
      query = query.lte('starts_at', end.toISOString());
    }

    query =
      filters.sort === 'popular'
        ? query.order('featured', { ascending: false })
        : filters.sort === 'newest'
          ? query.order('created_at', { ascending: false })
          : query.order('starts_at', { ascending: true });

    const { data, error, count } = await query.range(
      offset,
      offset + PAGE_SIZE - 1,
    );
    if (error) fail('Loading events', error);

    const items = await hydrate((data ?? []) as EventRow[]);
    const total = count ?? items.length;
    const next = offset + PAGE_SIZE;

    return { items, nextCursor: next < total ? next : null, total };
  },

  async getById(id: string): Promise<EventItem | null> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) fail('Loading the event', error);
    if (!data) return null;

    const roster = await attendeesFor([id]);
    return toEventItem(data as EventRow, roster[id] ?? []);
  },

  async listFeatured(): Promise<EventItem[]> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .eq('featured', true)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(6);
    if (error) fail('Loading featured events', error);
    return hydrate((data ?? []) as EventRow[]);
  },

  async listUpcoming(limit = 6): Promise<EventItem[]> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(limit);
    if (error) fail('Loading upcoming events', error);
    return hydrate((data ?? []) as EventRow[]);
  },

  /**
   * Interest-matched. Postgres has no cheap "overlap score" without a custom
   * function, so we over-fetch a little and rank in memory — fine at this size.
   */
  async listRecommended(user: User | null, limit = 6): Promise<EventItem[]> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(30);
    if (error) fail('Loading recommendations', error);

    const interests = new Set(
      (user?.interests ?? []).map((i) => i.toLowerCase()),
    );

    const ranked = ((data ?? []) as EventRow[])
      .map((row) => {
        const haystack = [row.category, ...(row.tags ?? [])].map((t) =>
          t.toLowerCase(),
        );
        const score = haystack.reduce(
          (acc, t) => acc + (interests.has(t) ? 1 : 0),
          0,
        );
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.row);

    return hydrate(ranked);
  },

  async listByHost(hostId: string): Promise<EventItem[]> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .eq('host_id', hostId)
      .order('starts_at', { ascending: false });
    if (error) fail('Loading your events', error);
    return hydrate((data ?? []) as EventRow[]);
  },

  async listByAttendee(userId: string): Promise<EventItem[]> {
    const { data: rsvps } = await client()
      .from('rsvps')
      .select('event_id')
      .eq('profile_id', userId)
      .neq('status', 'cancelled');

    const ids = (rsvps ?? []).map((r) => (r as { event_id: string }).event_id);
    if (ids.length === 0) return [];

    const { data, error } = await client()
      .from('events')
      .select('*')
      .in('id', ids)
      .order('starts_at');
    if (error) fail('Loading your tickets', error);
    return hydrate((data ?? []) as EventRow[]);
  },

  async listByCommunity(communityId: string): Promise<EventItem[]> {
    const { data, error } = await client()
      .from('events')
      .select('*')
      .eq('community_id', communityId)
      .order('starts_at');
    if (error) fail('Loading community events', error);
    return hydrate((data ?? []) as EventRow[]);
  },

  async listLocations(): Promise<string[]> {
    const { data } = await client()
      .from('events')
      .select('location')
      .gte('starts_at', new Date().toISOString());
    const set = new Set(
      (data ?? [])
        .map((r) => (r as { location: string }).location)
        .filter(Boolean),
    );
    return Array.from(set).sort();
  },

  async create(input: CreateEventInput, hostId: string): Promise<EventItem> {
    const { data, error } = await client()
      .from('events')
      .insert({
        title: input.title,
        description: input.description,
        host_id: hostId,
        community_id: input.communityId ?? null,
        cover_gradient: input.coverGradient,
        cover_image: input.coverImage ?? null,
        category: input.category,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        location: input.location,
        is_online: input.isOnline,
        capacity: input.capacity,
        price: input.price,
        visibility: input.visibility,
        requires_approval: input.requiresApproval,
        token_gated: input.tokenGated,
        gate_requirement: input.gateRequirement ?? null,
        tags: input.tags,
        schedule: input.schedule ?? [],
      })
      .select()
      .single();

    if (error) fail('Publishing the event', error);
    return toEventItem(data as EventRow, [hostId]);
  },

  /**
   * RSVP toggle.
   *
   * Both directions go through SQL functions so capacity, duplicate tickets and
   * serial allocation are enforced atomically rather than raced on the client.
   */
  async toggleRsvp(eventId: string, userId: string): Promise<EventItem> {
    const supabase = client();

    const { data: existing } = await supabase
      .from('rsvps')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('profile_id', userId)
      .maybeSingle();

    const going =
      existing && (existing as { status: string }).status !== 'cancelled';

    const { error } = going
      ? await supabase.rpc('cancel_rsvp', { p_event_id: eventId })
      : await supabase.rpc('rsvp', { p_event_id: eventId });

    if (error) fail(going ? 'Cancelling your RSVP' : 'Reserving your ticket', error);

    const updated = await supabaseEventRepository.getById(eventId);
    if (!updated) fail('Reloading the event', null);
    return updated;
  },
};

/* -------------------------------------------------------------------------- */
/*  Users                                                                      */
/* -------------------------------------------------------------------------- */

export const supabaseUserRepository = {
  async getById(id: string): Promise<User | null> {
    const { data } = await client()
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data ? toUser(data) : null;
  },

  async getMany(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const { data } = await client().from('profiles').select('*').in('id', ids);
    return (data ?? []).map(toUser);
  },

  async search(query: string): Promise<User[]> {
    const q = query.trim();
    let request = client().from('profiles').select('*').limit(40);
    if (q) request = request.or(`name.ilike.%${q}%,handle.ilike.%${q}%`);
    const { data } = await request;
    return (data ?? []).map(toUser);
  },

  /**
   * Resolve the profile that owns a wallet.
   *
   * Unlike the mock, this cannot *create* a row: RLS requires `auth.uid()`, and
   * a wallet on its own is not an authenticated session. So a wallet with no
   * linked account gets a local, unsaved identity — enough to browse, not
   * enough to RSVP. That is exactly the wallet-primary model: the wallet is the
   * identity, but the account behind it is created by linking Google.
   */
  async ensureWalletUser(address: string): Promise<User> {
    const { data } = await client()
      .from('profiles')
      .select('*')
      .eq('wallet_address', address)
      .maybeSingle();

    if (data) return toUser(data);

    return {
      id: `wallet:${address}`,
      name: `${address.slice(0, 4)}…${address.slice(-4)}`,
      handle: `sol${address.slice(0, 6).toLowerCase()}`,
      walletAddress: address,
      authMethod: 'wallet',
      reputation: 0,
      interests: [],
      createdAt: Date.now(),
    };
  },

  async update(id: string, patch: Partial<User>): Promise<User> {
    // Unsaved wallet-only identities have no row to update yet.
    if (id.startsWith('wallet:')) {
      throw new Error(
        'Link a Google account before editing your profile — there is nothing to save to yet.',
      );
    }

    const { data, error } = await client()
      .from('profiles')
      .update({
        name: patch.name,
        handle: patch.handle,
        bio: patch.bio ?? null,
        location: patch.location ?? null,
        website: patch.website ?? null,
        twitter: patch.twitter ?? null,
        interests: patch.interests,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) fail('Saving your profile', error);
    return toUser(data);
  },
};

/* -------------------------------------------------------------------------- */
/*  Communities                                                                */
/* -------------------------------------------------------------------------- */

async function hydrateCommunities(rows: CommunityRow[]): Promise<Community[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [{ data: members }, { data: events }] = await Promise.all([
    client().from('community_members').select('community_id, profile_id').in('community_id', ids),
    client().from('events').select('community_id').in('community_id', ids),
  ]);

  const memberMap: Record<string, string[]> = {};
  (members ?? []).forEach((row) => {
    const r = row as { community_id: string; profile_id: string };
    (memberMap[r.community_id] ??= []).push(r.profile_id);
  });

  const eventCounts: Record<string, number> = {};
  (events ?? []).forEach((row) => {
    const id = (row as { community_id: string | null }).community_id;
    if (id) eventCounts[id] = (eventCounts[id] ?? 0) + 1;
  });

  return rows.map((row) =>
    toCommunity(row, memberMap[row.id] ?? [], eventCounts[row.id] ?? 0),
  );
}

export const supabaseCommunityRepository = {
  async list(): Promise<Community[]> {
    const { data, error } = await client().from('communities').select('*');
    if (error) fail('Loading communities', error);
    const list = await hydrateCommunities((data ?? []) as CommunityRow[]);
    return list.sort((a, b) => b.memberCount - a.memberCount);
  },

  async listTrending(limit = 5): Promise<Community[]> {
    const all = await supabaseCommunityRepository.list();
    return [...all].sort((a, b) => b.eventCount - a.eventCount).slice(0, limit);
  },

  async getById(id: string): Promise<Community | null> {
    const { data } = await client()
      .from('communities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const [hydrated] = await hydrateCommunities([data as CommunityRow]);
    return hydrated ?? null;
  },

  async listByMember(userId: string): Promise<Community[]> {
    const { data: memberships } = await client()
      .from('community_members')
      .select('community_id')
      .eq('profile_id', userId);

    const ids = (memberships ?? []).map(
      (m) => (m as { community_id: string }).community_id,
    );
    if (ids.length === 0) return [];

    const { data } = await client().from('communities').select('*').in('id', ids);
    return hydrateCommunities((data ?? []) as CommunityRow[]);
  },

  async toggleMembership(id: string, userId: string): Promise<Community> {
    const supabase = client();

    const { data: existing } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('community_id', id)
      .eq('profile_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('profile_id', userId);
    } else {
      await supabase
        .from('community_members')
        .insert({ community_id: id, profile_id: userId });
    }

    const updated = await supabaseCommunityRepository.getById(id);
    if (!updated) fail('Reloading the community', null);
    return updated;
  },
};

/* -------------------------------------------------------------------------- */
/*  Tickets                                                                    */
/* -------------------------------------------------------------------------- */

export const supabaseTicketRepository = {
  async listByOwner(ownerId: string): Promise<Ticket[]> {
    const { data, error } = await client()
      .from('tickets')
      .select('*')
      .eq('owner_id', ownerId)
      .order('minted_at', { ascending: false });
    if (error) fail('Loading your tickets', error);
    return ((data ?? []) as TicketRow[]).map(toTicket);
  },

  async getById(id: string): Promise<Ticket | null> {
    const { data } = await client()
      .from('tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data ? toTicket(data as TicketRow) : null;
  },

  async getByEvent(eventId: string, ownerId: string): Promise<Ticket | null> {
    const { data } = await client()
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    return data ? toTicket(data as TicketRow) : null;
  },

  /**
   * Redeem a scanned code. The server verifies the secret and that the caller
   * hosts the event — the client is never trusted with either check.
   */
  async redeemQr(payload: string): Promise<Ticket> {
    const parsed = parseQrPayload(payload);
    if (!parsed) {
      throw new Error('That QR code is not an Eventerz ticket.');
    }

    const { data, error } = await client().rpc('check_in_ticket', {
      p_ticket_id: parsed.ticketId,
      p_qr_secret: parsed.secret,
    });

    if (error) fail('Checking in', error);
    return toTicket(data as TicketRow);
  },

  /** Badges are derived from attendance until a dedicated table exists. */
  async listBadges(ownerId: string) {
    const { data } = await client()
      .from('tickets')
      .select('id, event_id, checked_in_at')
      .eq('owner_id', ownerId)
      .eq('status', 'used')
      .order('checked_in_at', { ascending: false });

    return (data ?? []).map((row) => {
      const r = row as { id: string; event_id: string; checked_in_at: string };
      return {
        id: `poap_${r.id}`,
        name: 'Proof of Attendance',
        description: 'You showed up — recorded on your profile.',
        icon: 'BadgeCheck',
        accent: 'cyan' as const,
        earnedAt: Date.parse(r.checked_in_at) || Date.now(),
        eventId: r.event_id,
      };
    });
  },
};

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

export const supabaseNotificationRepository = {
  async list(): Promise<AppNotification[]> {
    const { data, error } = await client()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) fail('Loading notifications', error);
    return ((data ?? []) as NotificationRow[]).map(toNotification);
  },

  async unreadCount(): Promise<number> {
    const { count } = await client()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);
    return count ?? 0;
  },

  async markRead(id: string): Promise<void> {
    await client().from('notifications').update({ read: true }).eq('id', id);
  },

  async markAllRead(): Promise<void> {
    await client().from('notifications').update({ read: true }).eq('read', false);
  },
};

/* -------------------------------------------------------------------------- */
/*  Organizer analytics                                                        */
/* -------------------------------------------------------------------------- */

export const supabaseAnalyticsRepository = {
  async getOrganizerStats(hostId: string): Promise<OrganizerStats> {
    const { data: events } = await client()
      .from('events')
      .select('id, price')
      .eq('host_id', hostId);

    const eventIds = (events ?? []).map((e) => (e as { id: string }).id);

    if (eventIds.length === 0) {
      return {
        eventsCreated: 0,
        ticketsMinted: 0,
        revenueSol: 0,
        attendanceRate: 0,
        deltas: {
          eventsCreated: '0%',
          ticketsMinted: '0%',
          revenueSol: '0%',
          attendanceRate: '0%',
        },
      };
    }

    const { data: tickets } = await client()
      .from('tickets')
      .select('id, status, event_id')
      .in('event_id', eventIds);

    const all = (tickets ?? []) as { status: string; event_id: string }[];
    const used = all.filter((t) => t.status === 'used').length;

    // Revenue derives from each event's price string × its tickets. Prices are
    // display strings ("0.5 SOL"), so parse defensively.
    const priceOf = new Map(
      (events ?? []).map((e) => {
        const row = e as { id: string; price: string };
        return [row.id, Number.parseFloat(row.price) || 0];
      }),
    );
    const revenueSol = all.reduce(
      (sum, t) => sum + (priceOf.get(t.event_id) ?? 0),
      0,
    );

    return {
      eventsCreated: eventIds.length,
      ticketsMinted: all.length,
      revenueSol: Number(revenueSol.toFixed(2)),
      attendanceRate: all.length ? Math.round((used / all.length) * 100) : 0,
      deltas: {
        eventsCreated: '',
        ticketsMinted: '',
        revenueSol: '',
        attendanceRate: '',
      },
    };
  },

  /** Tickets minted per month over the last nine months. */
  async getMintsSeries(): Promise<AnalyticsPoint[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - 8);

    const { data } = await client()
      .from('tickets')
      .select('minted_at')
      .gte('minted_at', since.toISOString());

    const buckets = new Map<string, number>();
    for (let i = 8; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      buckets.set(d.toLocaleDateString('en-US', { month: 'short' }), 0);
    }

    (data ?? []).forEach((row) => {
      const label = new Date(
        (row as { minted_at: string }).minted_at,
      ).toLocaleDateString('en-US', { month: 'short' });
      if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
    });

    return Array.from(buckets, ([label, value]) => ({ label, value }));
  },

  async getAttendanceSeries(): Promise<AnalyticsPoint[]> {
    const { data: events } = await client()
      .from('events')
      .select('id, title')
      .order('starts_at', { ascending: false })
      .limit(5);

    const rows = (events ?? []) as { id: string; title: string }[];
    if (rows.length === 0) return [];

    const { data: tickets } = await client()
      .from('tickets')
      .select('event_id, status')
      .in('event_id', rows.map((e) => e.id));

    const all = (tickets ?? []) as { event_id: string; status: string }[];

    return rows.map((event) => {
      const mine = all.filter((t) => t.event_id === event.id);
      const used = mine.filter((t) => t.status === 'used').length;
      return {
        label: event.title.split(' ')[0],
        value: mine.length ? Math.round((used / mine.length) * 100) : 0,
      };
    });
  },

  async listRecentRegistrations(limit = 6): Promise<Registration[]> {
    const { data } = await client()
      .from('rsvps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).map((row) => {
      const r = row as {
        id: string;
        event_id: string;
        profile_id: string;
        wallet_address: string | null;
        created_at: string;
        status: string;
      };
      return {
        id: r.id,
        eventId: r.event_id,
        userId: r.profile_id,
        walletAddress: r.wallet_address ?? '',
        createdAt: Date.parse(r.created_at) || Date.now(),
        status:
          r.status === 'confirmed'
            ? 'confirmed'
            : r.status === 'waitlist'
              ? 'waitlist'
              : 'pending',
      };
    });
  },
};
