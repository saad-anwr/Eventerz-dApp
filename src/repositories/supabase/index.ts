/**
 * Supabase-backed repositories.
 *
 * Same shape as the mock repositories - `repositories/index.ts` picks between
 * them from one flag, so screens and hooks never learn which is in play.
 */

import type {
  AnalyticsPoint,
  AppNotification,
  Community,
  EventFilters,
  EventGuest,
  EventItem,
  GuestPreviewEntry,
  OrganizerStats,
  Page,
  Registration,
  RsvpState,
  Ticket,
  User,
} from '@/types';

import type { CreateEventInput, UpdateEventInput } from '../event-repository';
import { PROFILE_COLUMNS, type ProfileRow } from '@/services/auth/types';
import { parseQrPayload } from '@/utils/check-in';
import { assertRealIdentity } from '@/utils/identity';
import { postgrestLikePattern } from '@/utils/postgrest';
import {
  toCommunity,
  toEventGuest,
  toEventItem,
  toNotification,
  toTicket,
  toUser,
  type CommunityRow,
  type EventGuestRow,
  type EventRow,
  type NotificationRow,
  type TicketRow,
} from './rows';
import { client, fail } from './client';

const PAGE_SIZE = 8;

/**
 * The body of a non-2xx Edge Function response.
 *
 * supabase-js raises on non-2xx and flattens the payload into
 * "Edge Function returned a non-2xx status code", which is exactly the sentence
 * that tells a user nothing. The reason the gate refused - no linked wallet, or
 * a holding that is short - is in the body or nowhere.
 */
async function readFunctionBody(
  error: unknown,
): Promise<Record<string, unknown> | null> {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Join a token-gated event through the Edge Function.
 *
 * The balance is read server-side from the wallet on the caller's profile,
 * which got there through the signed link flow (0011) - a wallet they proved
 * they hold rather than one they named. A client-side balance check would be a
 * suggestion, not a gate, which is why this does not read holdings locally even
 * though the app now can.
 */
async function joinGatedEvent(eventId: string): Promise<void> {
  const { error } = await client().functions.invoke('check-gate', {
    body: { eventId },
  });
  if (!error) return;

  const body = await readFunctionBody(error);

  // A refusal carries `reason` and a human `detail`. Prefer that over the
  // transport error, which only ever says a non-2xx came back.
  if (typeof body?.detail === 'string') throw new Error(body.detail);
  if (typeof body?.error === 'string') throw new Error(body.error);

  throw new Error(
    'This event is token-gated and the entry check could not be reached. Try again in a moment.',
  );
}

/** The signed-in user's id, or null. Reads the cached session - no round trip. */
async function currentUserId(): Promise<string | null> {
  const { data } = await client().auth.getSession();
  return data.session?.user.id ?? null;
}

interface RosterResult {
  /** Confirmed guests per event, as far as RLS lets this viewer see them. */
  roster: Record<string, string[]>;
  /** This viewer's own status per event. */
  mine: Record<string, RsvpState>;
  /** 1-based waitlist place, only for events where the viewer holds one. */
  positions: Record<string, number>;
}

/**
 * Rosters and own-status for a set of events, in one round trip rather than N.
 *
 * The same query serves everyone - it returns the full roster for events the
 * viewer hosts or attends and just their own row elsewhere, because RLS decides
 * what it yields rather than the client asking differently.
 */
async function rosterFor(eventIds: string[]): Promise<RosterResult> {
  if (eventIds.length === 0) return { roster: {}, mine: {}, positions: {} };

  const [{ data }, me] = await Promise.all([
    client().from('rsvps').select('event_id, profile_id, status').in('event_id', eventIds),
    currentUserId(),
  ]);

  const roster: Record<string, string[]> = {};
  const mine: Record<string, RsvpState> = {};

  (data ?? []).forEach((row) => {
    const r = row as { event_id: string; profile_id: string; status: RsvpState };
    if (r.status === 'confirmed') (roster[r.event_id] ??= []).push(r.profile_id);
    if (me && r.profile_id === me) mine[r.event_id] = r.status;
  });

  /*
   * One extra round trip, and only when the viewer is waitlisted somewhere.
   * Asking per event would be an N+1 that grows with how patient the user has
   * been, which is a strange thing to charge them for.
   */
  const waitlisted = Object.entries(mine)
    .filter(([, status]) => status === 'waitlist')
    .map(([eventId]) => eventId);

  const positions = await waitlistPositions(waitlisted);

  return { roster, mine, positions };
}

/**
 * The viewer's place in the queue for each event.
 *
 * A failure here is not worth failing the screen over: the position is extra
 * detail on a status the guest can already see, so an empty result renders the
 * generic "you are on the waitlist" line and nothing looks broken.
 */
async function waitlistPositions(
  eventIds: string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await client().rpc('my_waitlist_positions', {
    p_event_ids: eventIds,
  });
  if (error || !data) return {};

  const rows = data as { event_id: string; queue_position: number }[];
  return Object.fromEntries(rows.map((r) => [r.event_id, r.queue_position]));
}

async function hydrate(rows: EventRow[]): Promise<EventItem[]> {
  const { roster, mine, positions } = await rosterFor(rows.map((r) => r.id));
  return rows.map((row) =>
    toEventItem(row, roster[row.id] ?? [], mine[row.id], positions[row.id]),
  );
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
      // Quoted into a single literal - see `postgrestLikePattern`. Raw
      // interpolation here lets `,` and `.` add conditions to the filter.
      const q = postgrestLikePattern(filters.query);
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

    const { roster, mine, positions } = await rosterFor([id]);
    return toEventItem(data as EventRow, roster[id] ?? [], mine[id], positions[id]);
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
   * function, so we over-fetch a little and rank in memory - fine at this size.
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

  /**
   * Events the viewer has a live relationship with.
   *
   * Includes pending and waitlisted, not only confirmed - someone who has asked
   * to join needs somewhere to watch for the host's answer. Declined and
   * cancelled are excluded: listing them here would read as still being in the
   * running.
   */
  async listByAttendee(userId: string): Promise<EventItem[]> {
    const { data: rsvps } = await client()
      .from('rsvps')
      .select('event_id')
      .eq('profile_id', userId)
      .in('status', ['confirmed', 'pending', 'waitlist']);

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
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        place_id: input.placeId ?? null,
        address: input.address ?? null,
      })
      .select()
      .single();

    if (error) fail('Publishing the event', error);
    return toEventItem(data as EventRow, [hostId]);
  },

  /**
   * Edit an event. Host only, enforced server-side.
   *
   * Undefined fields are omitted so the RPC leaves them alone. A full-row write
   * would send stale values for everything the form did not touch and clobber a
   * concurrent edit from another device with them.
   */
  async updateEvent(
    eventId: string,
    patch: UpdateEventInput,
  ): Promise<EventItem> {
    const { error } = await client().rpc('update_event', {
      p_event_id: eventId,
      p_title: patch.title,
      p_description: patch.description,
      p_category: patch.category,
      p_starts_at: patch.startsAt,
      p_ends_at: patch.endsAt ?? undefined,
      // Null and undefined mean different things to the RPC and the same thing
      // to an optional property, so clearing an end time needs its own flag.
      p_clear_ends_at: patch.endsAt === null,
      p_location: patch.location,
      p_is_online: patch.isOnline,
      p_capacity: patch.capacity,
      p_price: patch.price,
      p_visibility: patch.visibility,
      p_requires_approval: patch.requiresApproval,
      p_tags: patch.tags,
      p_cover_gradient: patch.coverGradient,
      p_cover_image: patch.coverImage,
      p_latitude: patch.latitude,
      p_longitude: patch.longitude,
      p_place_id: patch.placeId,
      p_address: patch.address,
    });
    if (error) fail('Saving your changes', error);
    return reloadEvent(eventId);
  },

  /**
   * Call an event off.
   *
   * Soft: the row survives, every live RSVP is closed and everyone who was
   * coming is notified. Deleting would cascade to `rsvps` and `tickets` and
   * erase the attendance record of anyone who had already checked in.
   */
  async cancelEvent(eventId: string, reason?: string): Promise<EventItem> {
    const { error } = await client().rpc('cancel_event', {
      p_event_id: eventId,
      p_reason: reason?.trim() || null,
    });
    if (error) fail('Cancelling the event', error);
    return reloadEvent(eventId);
  },

  /**
   * Ask to attend.
   *
   * The server decides the outcome - confirmed, pending approval, or waitlisted
   * - because capacity and approval must be evaluated atomically with the seat
   * being granted. The reloaded event carries the resulting `myStatus`, so the
   * screen renders the real state rather than an optimistic guess.
   */
  async requestToJoin(eventId: string): Promise<EventItem> {
    const { error } = await client().rpc('request_to_join', {
      p_event_id: eventId,
    });

    /*
     * `request_to_join` refuses token-gated events with P0001 (migration 0013):
     * Postgres makes no outbound RPC calls, so it cannot read a token balance
     * and fails closed rather than admitting anyone. The gated door is the
     * `check-gate` Edge Function, which reads the holding from the cluster
     * first.
     *
     * Without this branch a gated event is simply un-joinable on mobile - the
     * website has routed on P0001 since 0013 landed, so the same event admitted
     * people in a browser and showed a raw Postgres error on a phone.
     *
     * Routing on the *error* rather than on a `tokenGated` flag read earlier is
     * deliberate, and matches the web client: the flag this screen holds may be
     * stale by exactly the race that matters, a host enabling gating while
     * someone is sitting on the page.
     */
    if (error?.code === 'P0001') {
      await joinGatedEvent(eventId);
      return reloadEvent(eventId);
    }

    if (error) fail('Sending your request', error);
    return reloadEvent(eventId);
  },

  async cancelRsvp(eventId: string): Promise<EventItem> {
    const { error } = await client().rpc('cancel_rsvp', { p_event_id: eventId });
    if (error) fail('Cancelling your RSVP', error);
    return reloadEvent(eventId);
  },

  /** Host action: admit a pending or waitlisted guest, issuing their ticket. */
  async approveGuest(eventId: string, profileId: string): Promise<EventItem> {
    const { error } = await client().rpc('approve_guest', {
      p_event_id: eventId,
      p_profile_id: profileId,
    });
    if (error) fail('Approving the guest', error);
    return reloadEvent(eventId);
  },

  /** Host action: decline a request, or remove someone already confirmed. */
  async declineGuest(eventId: string, profileId: string): Promise<EventItem> {
    const { error } = await client().rpc('decline_guest', {
      p_event_id: eventId,
      p_profile_id: profileId,
    });
    if (error) fail('Declining the guest', error);
    return reloadEvent(eventId);
  },

  /**
   * The full guest list. RLS returns rows only to the host and confirmed
   * guests, so there is no separate permission check to keep in sync here.
   */
  async listGuests(eventId: string): Promise<EventGuest[]> {
    const { data, error } = await client()
      .from('event_guests')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) fail('Loading the guest list', error);
    return ((data ?? []) as EventGuestRow[]).map(toEventGuest);
  },

  /**
   * A few faces for viewers who cannot read the roster.
   *
   * Backed by a SECURITY DEFINER function so it can sample rows the caller
   * cannot select, bounded server-side so it cannot be walked to rebuild the
   * full list.
   */
  async guestPreview(eventId: string, limit = 3): Promise<GuestPreviewEntry[]> {
    const { data, error } = await client().rpc('event_guest_preview', {
      p_event_id: eventId,
      p_limit: limit,
    });
    if (error) fail('Loading who is going', error);

    const rows = (data ?? []) as {
      id: string;
      name: string;
      avatar_url: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatarUrl: r.avatar_url ?? undefined,
    }));
  },
};

/** Re-read an event after a mutation so the caller gets authoritative state. */
async function reloadEvent(eventId: string): Promise<EventItem> {
  const updated = await supabaseEventRepository.getById(eventId);
  if (!updated) fail('Reloading the event', null);
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                      */
/* -------------------------------------------------------------------------- */

export const supabaseUserRepository = {
  async getById(id: string): Promise<User | null> {
    const { data } = await client()
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    return data ? toUser(data) : null;
  },

  async getMany(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const { data } = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
    return (data ?? []).map(toUser);
  },

  async search(query: string): Promise<User[]> {
    const q = query.trim();
    let request = client().from('profiles').select(PROFILE_COLUMNS).limit(40);
    /*
     * `.or()` takes PostgREST's filter grammar, not a parameter, so raw input
     * interpolated into it stops being a value the moment it contains `,` `.`
     * or `(` - a search for `x,id.eq.<uuid>` appends a whole extra condition.
     * `postgrestLikePattern` quotes it into a single literal. See the helper
     * for why the wildcards go inside the quotes.
     */
    if (q) {
      const pattern = postgrestLikePattern(q);
      request = request.or(`name.ilike.${pattern},handle.ilike.${pattern}`);
    }
    const { data } = await request;
    return (data ?? []).map(toUser);
  },

  /**
   * Resolve the profile that owns a wallet.
   *
   * Goes through `profile_for_wallet` (0022) rather than filtering
   * `profiles.wallet_address` directly. The column still exists and is still
   * accurate, but it only ever holds the account's *primary* wallet, so a
   * direct filter answers "no such account" for every other wallet the same
   * person has linked - which is the whole problem 0022 exists to fix. The
   * function resolves through `wallet_links` instead.
   *
   * This cannot *create* a row: RLS requires `auth.uid()`, and a wallet on its
   * own is not a Supabase session. A wallet nobody has linked therefore gets a
   * local, unsaved identity - enough to browse, not enough to write. Turning it
   * into an account is what signing in with Google does.
   */
  async ensureWalletUser(address: string): Promise<User> {
    /*
     * The `slice` calls below are why this guard exists rather than trusting the
     * signature. A wallet that returned a null address used to reach here typed
     * as `string`, and the crash the user saw was a TypeError from this
     * function - "Cannot read property 'slice' of null" - reported as
     * "Connection failed". `toBase58` now refuses at the boundary; this is the
     * second line of defence, because a bad address should never be a crash.
     */
    if (typeof address !== 'string' || address.length === 0) {
      throw new Error('That wallet did not provide a usable address.');
    }

    const { data } = await client()
      .rpc('profile_for_wallet', { p_wallet_address: address })
      .maybeSingle();

    /*
     * `data.id`, not `data`.
     *
     * 0022 declared `profile_for_wallet` as `returns public.profiles` - a bare
     * composite type, which in Postgres always yields exactly one row. A wallet
     * nobody has linked therefore came back not as zero rows but as a row of
     * NULLs, which PostgREST reports as an object, which `maybeSingle()` hands
     * over, which `if (data)` accepts. `toUser` then read
     * `row.handle ?? row.id.slice(0, 8)` and threw
     *
     *     Cannot read property 'slice' of null
     *
     * under "Connection failed" - the error the dApp Store reviewer hit, on
     * every wallet they owned, because an unlinked wallet is the only kind a
     * reviewer has. 0024 fixes the function to `returns setof`; this checks the
     * shape rather than the truthiness, so a schema that lies cannot crash
     * onboarding again.
     */
    const row = data as ProfileRow | null;
    if (row?.id) return toUser(row);

    return {
      id: `wallet:${address}`,
      name: `${address.slice(0, 4)}...${address.slice(-4)}`,
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
        'Link a Google account before editing your profile - there is nothing to save to yet.',
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
        /*
         * Only written when the patch carries it. `?? null` here would blank an
         * existing picture on every unrelated save - the profile form does not
         * send `avatarUrl`, so every "Save changes" would silently delete it.
         */
        ...(patch.avatarUrl !== undefined
          ? { avatar_url: patch.avatarUrl }
          : {}),
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

    /*
     * Joining writes a `profile_id`, so it needs a real profile row. Without
     * this a wallet-only user - one who connected a wallet and has not signed
     * in with Google - sent `wallet:<address>` into a uuid column and got
     *
     *     invalid input syntax for type uuid: "wallet:CiM2ZRkc..."
     *
     * which is the exact failure `assertRealIdentity` exists to prevent. Every
     * other write path already called it; Communities was missed.
     */
    assertRealIdentity(userId);

    const { data: existing, error: lookupError } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('community_id', id)
      .eq('profile_id', userId)
      .maybeSingle();
    if (lookupError) fail('Checking your membership', lookupError);

    /*
     * Errors checked rather than discarded. All three calls used to be bare
     * `await`s, so a rejected insert - RLS, a token-gated community, a dropped
     * connection - was thrown away and the reload below returned the community
     * unchanged. The button flipped back and nothing said why, which reads as
     * the app ignoring the tap.
     */
    const { error: writeError } = existing
      ? await supabase
          .from('community_members')
          .delete()
          .eq('community_id', id)
          .eq('profile_id', userId)
      : await supabase
          .from('community_members')
          .insert({ community_id: id, profile_id: userId });

    if (writeError) {
      fail(existing ? 'Leaving the community' : 'Joining the community', writeError);
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
   * hosts the event - the client is never trusted with either check.
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
        description: 'You showed up - recorded on your profile.',
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

    // Revenue derives from each event's price string x its tickets. Prices are
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
