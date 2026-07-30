import { describe, expect, it } from 'vitest';

import {
  RSVP_PRESENTATION,
  filledPercent,
  formatOrdinal,
  goingCount,
  hasEnded,
  isCancelled,
  isConfirmed,
  isEditable,
  isFull,
  isLiveRsvp,
  myRsvpState,
  rsvpActionLabel,
  rsvpDetail,
  spotsLeft,
  waitlistDetail,
} from './rsvp';
import type { EventItem, RsvpState } from '@/types';

/**
 * The parity suite.
 *
 * This file mirrors the website's `lib/events.test.ts` assertion for assertion.
 * The two modules are hand-maintained 1:1 ports, and the failure mode of drift is
 * not a crash — it is a guest seeing "Requested to attend" on the website and
 * something else in the app, and having to work out whether they mean the same
 * thing. The literal strings below are asserted on both sides on purpose: they
 * are the contract, not an implementation detail.
 */
const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'e1',
    title: 'Solana Builders',
    description: '',
    hostId: 'host',
    coverGradient: 'purple-blue',
    category: 'Meetup',
    startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    location: 'Delhi',
    isOnline: false,
    capacity: 10,
    price: 'Free',
    visibility: 'public',
    requiresApproval: false,
    tokenGated: false,
    attendeeIds: [],
    tags: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('goingCount', () => {
  it('prefers the server counter over the roster length', () => {
    expect(goingCount(event({ confirmedCount: 42, attendeeIds: ['me'] }))).toBe(42);
  });

  it('falls back to the roster for the mock backend', () => {
    expect(goingCount(event({ attendeeIds: ['a', 'b', 'c'] }))).toBe(3);
  });

  it('reports zero rather than NaN', () => {
    expect(goingCount(event())).toBe(0);
  });
});

describe('myRsvpState', () => {
  it('trusts the server status over roster membership', () => {
    expect(myRsvpState(event({ myStatus: 'pending', attendeeIds: ['me'] }), 'me')).toBe(
      'pending',
    );
  });

  it('reads roster membership as confirmed for the mock backend', () => {
    expect(myRsvpState(event({ attendeeIds: ['me'] }), 'me')).toBe('confirmed');
  });

  it('is undefined for someone who never asked, and when signed out', () => {
    expect(myRsvpState(event(), 'me')).toBeUndefined();
    expect(myRsvpState(event({ attendeeIds: ['me'] }), null)).toBeUndefined();
  });
});

describe('capacity', () => {
  it('floors seats left at zero', () => {
    const e = event({ capacity: 5, confirmedCount: 8 });
    expect(spotsLeft(e)).toBe(0);
    expect(isFull(e)).toBe(true);
  });

  it('clamps the progress bar and never divides by zero', () => {
    expect(filledPercent(event({ capacity: 5, confirmedCount: 8 }))).toBe(100);
    expect(filledPercent(event({ capacity: 0, confirmedCount: 3 }))).toBe(0);
  });
});

describe('lifecycle', () => {
  it('treats a running event as not ended', () => {
    expect(
      hasEnded(
        event({
          startsAt: new Date(Date.now() - HOUR).toISOString(),
          endsAt: new Date(Date.now() + HOUR).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('falls back to the start time with no end time', () => {
    expect(hasEnded(event({ startsAt: new Date(Date.now() - HOUR).toISOString() }))).toBe(
      true,
    );
  });

  it('blocks editing a cancelled or finished event', () => {
    expect(isEditable(event({ cancelledAt: new Date().toISOString() }))).toBe(false);
    expect(
      isEditable(event({ startsAt: new Date(Date.now() - HOUR).toISOString() })),
    ).toBe(false);
    expect(isEditable(event())).toBe(true);
  });

  it('detects cancellation', () => {
    expect(isCancelled(event({ cancelledAt: new Date().toISOString() }))).toBe(true);
    expect(isCancelled(event())).toBe(false);
  });
});

describe('rsvpActionLabel', () => {
  it('matches the website exactly', () => {
    expect(
      rsvpActionLabel(event({ capacity: 1, confirmedCount: 1, requiresApproval: true })),
    ).toBe('Join the waitlist');
    expect(rsvpActionLabel(event({ requiresApproval: true }))).toBe('Request to attend');
    expect(rsvpActionLabel(event())).toBe('RSVP on-chain');
  });
});

describe('waitlist position', () => {
  it('falls back to the generic line when unknown', () => {
    expect(waitlistDetail(event())).toBe(RSVP_PRESENTATION.waitlist.detail);
    expect(waitlistDetail(event({ waitlistPosition: 0 }))).toBe(
      RSVP_PRESENTATION.waitlist.detail,
    );
  });

  it('says "next" for first place', () => {
    expect(waitlistDetail(event({ waitlistPosition: 1 }))).toContain('next in line');
  });

  it('gives the ordinal place beyond first', () => {
    expect(waitlistDetail(event({ waitlistPosition: 3 }))).toContain('3rd in line');
  });

  it('specialises only the waitlist state', () => {
    const e = event({ waitlistPosition: 3 });
    expect(rsvpDetail(e, 'waitlist')).toContain('3rd');
    for (const status of ['confirmed', 'pending', 'declined', 'cancelled'] as RsvpState[]) {
      expect(rsvpDetail(e, status)).toBe(RSVP_PRESENTATION[status].detail);
    }
  });
});

describe('formatOrdinal', () => {
  it('handles the teens', () => {
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(12)).toBe('12th');
    expect(formatOrdinal(13)).toBe('13th');
  });

  it('handles the ones and values past the teens', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(4)).toBe('4th');
    expect(formatOrdinal(21)).toBe('21st');
    expect(formatOrdinal(111)).toBe('111th');
    expect(formatOrdinal(121)).toBe('121st');
  });
});

describe('isLiveRsvp', () => {
  it('is true only for states the guest can withdraw', () => {
    expect(isLiveRsvp('confirmed')).toBe(true);
    expect(isLiveRsvp('pending')).toBe(true);
    expect(isLiveRsvp('waitlist')).toBe(true);
    expect(isLiveRsvp('declined')).toBe(false);
    expect(isLiveRsvp('cancelled')).toBe(false);
    expect(isLiveRsvp(undefined)).toBe(false);
  });
});

describe('isConfirmed', () => {
  it('is the gate for chat and the roster', () => {
    expect(isConfirmed(event({ myStatus: 'confirmed' }), 'me')).toBe(true);
    expect(isConfirmed(event({ myStatus: 'pending' }), 'me')).toBe(false);
    expect(isConfirmed(event({ myStatus: 'waitlist' }), 'me')).toBe(false);
  });
});

describe('RSVP_PRESENTATION parity with the website', () => {
  /**
   * The exact strings from `Eventerz/lib/events.ts`.
   *
   * Duplicated here rather than imported, because the two projects are separate
   * packages with no shared module — which is the whole reason drift is possible.
   * If these ever need to differ, that is a product decision and this test is
   * where it gets made explicitly.
   */
  const WEBSITE_WORDING: Record<RsvpState, { label: string; detail: string }> = {
    confirmed: {
      label: "You're going",
      detail: 'Your spot is confirmed and your ticket is ready.',
    },
    pending: {
      label: 'Requested to attend',
      detail:
        'The host has been notified. You will hear back here once they decide.',
    },
    waitlist: {
      label: 'On the waitlist',
      detail:
        'This event is full. You will be let in automatically if a spot opens.',
    },
    declined: {
      label: 'Request declined',
      detail: 'The host declined this request.',
    },
    cancelled: {
      label: 'RSVP cancelled',
      detail: 'You cancelled your RSVP. You can ask to join again.',
    },
  };

  it('uses identical wording on both platforms', () => {
    for (const [status, expected] of Object.entries(WEBSITE_WORDING)) {
      const actual = RSVP_PRESENTATION[status as RsvpState];
      expect(actual.label, `${status} label`).toBe(expected.label);
      expect(actual.detail, `${status} detail`).toBe(expected.detail);
    }
  });

  it('covers every status the database can produce', () => {
    for (const status of [
      'confirmed',
      'pending',
      'waitlist',
      'declined',
      'cancelled',
    ] as RsvpState[]) {
      expect(RSVP_PRESENTATION[status]?.accent).toBeTruthy();
    }
  });
});
