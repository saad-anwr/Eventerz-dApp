/**
 * Event guest-state helpers.
 *
 * Ported 1:1 from the web app's `lib/events.ts` so both clients report the same
 * counts and use the same wording for the same state. A guest who sees
 * "Requested to attend" on the website and "Pending" in the app has to work out
 * whether those are the same thing.
 *
 * Two backends have to produce the same answers: Supabase, where counts are
 * denormalised columns and the roster may be hidden by RLS, and the mock
 * backend, where `attendeeIds` holds everyone and there are no counts.
 */

import type { EventItem, RsvpState } from '@/types';

/** Confirmed guests. Falls back to the roster length for the mock backend. */
export function goingCount(event: EventItem): number {
  return event.confirmedCount ?? event.attendeeIds.length;
}

/**
 * The viewer's own state for this event.
 *
 * `myStatus` is authoritative when present. The roster fallback exists for the
 * mock backend, where membership is the only signal - and it can only ever mean
 * `confirmed`, since the mock has no approval concept.
 */
export function myRsvpState(
  event: EventItem,
  userId: string | null | undefined,
): RsvpState | undefined {
  if (event.myStatus) return event.myStatus;
  if (userId && event.attendeeIds.includes(userId)) return 'confirmed';
  return undefined;
}

/** Seats left, floored at zero - capacity can be lowered below the headcount. */
export function spotsLeft(event: EventItem): number {
  return Math.max(0, event.capacity - goingCount(event));
}

export function isFull(event: EventItem): boolean {
  return spotsLeft(event) === 0;
}

/** Percentage full, clamped, for the progress bar. */
export function filledPercent(event: EventItem): number {
  if (event.capacity <= 0) return 0;
  return Math.min(100, Math.round((goingCount(event) / event.capacity) * 100));
}

/** True when the viewer holds a seat - the gate for chat and the guest list. */
export function isConfirmed(
  event: EventItem,
  userId: string | null | undefined,
): boolean {
  return myRsvpState(event, userId) === 'confirmed';
}

/** The host called it off. Soft - the row and its screen survive. */
export function isCancelled(event: EventItem): boolean {
  return Boolean(event.cancelledAt);
}

/**
 * Past the point where the server will still accept a guest.
 *
 * Keyed off `endsAt` when there is one, matching `request_to_join`. Using
 * `startsAt` alone showed "Event ended" for an event that was running and still
 * letting people in.
 */
export function hasEnded(event: EventItem): boolean {
  return Date.parse(event.endsAt ?? event.startsAt) < Date.now();
}

/** Whether the host may still change anything. */
export function isEditable(event: EventItem): boolean {
  return !isCancelled(event) && !hasEnded(event);
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                              */
/* -------------------------------------------------------------------------- */

export interface RsvpPresentation {
  label: string;
  detail: string;
  /** Resolved hex, not a Tailwind class - used for borders and icon tints. */
  accent: string;
}

/** How each state reads to the guest. Wording matches the web app exactly. */
export const RSVP_PRESENTATION: Record<RsvpState, RsvpPresentation> = {
  confirmed: {
    label: "You're going",
    detail: 'Your spot is confirmed and your ticket is ready.',
    accent: '#14f195',
  },
  pending: {
    label: 'Requested to attend',
    detail:
      'The host has been notified. You will hear back here once they decide.',
    accent: '#fbbf24',
  },
  waitlist: {
    label: 'On the waitlist',
    detail:
      'This event is full. You will be let in automatically if a spot opens.',
    accent: '#22d3ee',
  },
  declined: {
    label: 'Request declined',
    detail: 'The host declined this request.',
    accent: '#f87171',
  },
  cancelled: {
    label: 'RSVP cancelled',
    detail: 'You cancelled your RSVP. You can ask to join again.',
    accent: colors.mutedForeground,
  },
};

/**
 * Label for the primary action, given what the viewer can actually do next.
 *
 * The button must not promise something the server will not do - a button
 * saying "RSVP" that produces a pending request is what made the old flow feel
 * broken.
 */
export function rsvpActionLabel(event: EventItem): string {
  if (isFull(event)) return 'Join the waitlist';
  if (event.requiresApproval) return 'Request to attend';
  return 'RSVP on-chain';
}

/** States where the viewer holds a live claim and can withdraw it. */
export function isLiveRsvp(status: RsvpState | undefined): boolean {
  return status === 'confirmed' || status === 'pending' || status === 'waitlist';
}

/**
 * The waitlist line, with the guest's place in it when we know it.
 *
 * "On the waitlist" alone is not actionable: third in line means keep the
 * evening free, fortieth means make other plans, and the difference is the
 * entire decision. Falls back to the generic sentence when the position has not
 * loaded - an unknown position must not render as "you are 0th".
 */
export function waitlistDetail(event: EventItem): string {
  const position = event.waitlistPosition;
  if (!position) return RSVP_PRESENTATION.waitlist.detail;

  if (position === 1) {
    return 'You are next in line. You will be let in as soon as a spot opens.';
  }
  return `You are ${formatOrdinal(position)} in line. You will be let in automatically if enough spots open.`;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function formatOrdinal(n: number): string {
  // The teens are the exception every naive implementation gets wrong: 11, 12
  // and 13 take "th" even though 1, 2 and 3 take "st", "nd", "rd".
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The state sentence for the RSVP card, with the waitlist case specialised.
 *
 * Every screen reads through this rather than indexing `RSVP_PRESENTATION`
 * directly, so the queue position appears everywhere the status does.
 */
export function rsvpDetail(event: EventItem, status: RsvpState): string {
  if (status === 'waitlist') return waitlistDetail(event);
  return RSVP_PRESENTATION[status].detail;
}
