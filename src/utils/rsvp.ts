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
 * mock backend, where membership is the only signal — and it can only ever mean
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

/** Seats left, floored at zero — capacity can be lowered below the headcount. */
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

/** True when the viewer holds a seat — the gate for chat and the guest list. */
export function isConfirmed(
  event: EventItem,
  userId: string | null | undefined,
): boolean {
  return myRsvpState(event, userId) === 'confirmed';
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                              */
/* -------------------------------------------------------------------------- */

export interface RsvpPresentation {
  label: string;
  detail: string;
  /** Resolved hex, not a Tailwind class — used for borders and icon tints. */
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
    accent: '#94a2b8',
  },
};

/**
 * Label for the primary action, given what the viewer can actually do next.
 *
 * The button must not promise something the server will not do — a button
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
