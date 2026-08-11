import { describe, expect, it } from 'vitest';

import {
  buildCheckInUrl,
  explainCheckInError,
  parseQrPayload,
} from './check-in';

/**
 * The round trip a ticket makes.
 *
 * These assertions exist because the absence of them cost something. The mock
 * repository carried a second, looser copy of `parseQrPayload` under a comment
 * promising it was "kept in step deliberately". It was not: the copy matched on
 * `ticket` alone and never required `secret`, so a truncated code checked a
 * guest in against the mock and was rejected against Supabase. Nothing failed,
 * because nothing was asserting.
 *
 * The build/parse round trip is the property that matters - anything
 * `buildCheckInUrl` emits, `parseQrPayload` must read back - so it is tested
 * directly rather than through either caller.
 */

const TICKET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
// Two fixed UUIDs standing in for a ticket id and its check-in code. The round
// trip needs opaque values it can compare, not real ones - nothing issued this
// pair and no row anywhere has it.
// check-secrets: allow fixed test fixture, never issued to a ticket
const SECRET = '9c858901-8a57-4791-81fe-4c455b099bc9';

describe('buildCheckInUrl / parseQrPayload round trip', () => {
  it('reads back exactly what it wrote', () => {
    expect(parseQrPayload(buildCheckInUrl(TICKET, SECRET))).toEqual({
      ticketId: TICKET,
      secret: SECRET,
    });
  });

  it('survives extra query parameters', () => {
    // The mock appends `&owner=`, and a real link may pick up tracking params.
    const url = `${buildCheckInUrl(TICKET, SECRET)}&owner=CiM2ZRkc`;
    expect(parseQrPayload(url)).toEqual({ ticketId: TICKET, secret: SECRET });
  });

  it('tolerates surrounding whitespace from a scanner', () => {
    const url = `  ${buildCheckInUrl(TICKET, SECRET)}\n`;
    expect(parseQrPayload(url)).toEqual({ ticketId: TICKET, secret: SECRET });
  });
});

describe('parseQrPayload accepted shapes', () => {
  it('accepts the app deep link', () => {
    expect(
      parseQrPayload(`eventerz://checkin?ticket=${TICKET}&secret=${SECRET}`),
    ).toEqual({ ticketId: TICKET, secret: SECRET });
  });

  /*
   * Tickets minted before the URL payload are in people's wallets and cannot be
   * re-issued. Dropping this shape would break every ticket already sold.
   */
  it('accepts the legacy custom scheme', () => {
    expect(
      parseQrPayload(`eventerz:v1:checkin?ticket=${TICKET}&secret=${SECRET}`),
    ).toEqual({ ticketId: TICKET, secret: SECRET });
  });

  it('accepts any host, because preview deploys mint real tickets', () => {
    expect(
      parseQrPayload(
        `https://eventerz-git-preview.vercel.app/checkin?ticket=${TICKET}&secret=${SECRET}`,
      ),
    ).toEqual({ ticketId: TICKET, secret: SECRET });
  });
});

describe('parseQrPayload rejections', () => {
  /*
   * The regression that motivated sharing one implementation: a half-scanned or
   * creased code loses the tail. It must fail here, not check somebody in.
   */
  it('rejects a payload with no secret', () => {
    expect(
      parseQrPayload(`https://eventerz.xyz/checkin?ticket=${TICKET}`),
    ).toBeNull();
  });

  it('rejects a payload with no ticket', () => {
    expect(
      parseQrPayload(`https://eventerz.xyz/checkin?secret=${SECRET}`),
    ).toBeNull();
  });

  it('rejects somebody else’s QR code', () => {
    expect(parseQrPayload('https://example.com/')).toBeNull();
    expect(parseQrPayload('WIFI:S=venue;T=WPA;P=hunter2;;')).toBeNull();
    expect(parseQrPayload('')).toBeNull();
  });

  it('rejects a checkin path on the wrong route', () => {
    expect(
      parseQrPayload(
        `https://eventerz.xyz/events/checkin-guide?ticket=${TICKET}&secret=${SECRET}`,
      ),
    ).toBeNull();
  });
});

describe('explainCheckInError', () => {
  /*
   * The literal strings are the contract. Somebody is reading these off a phone
   * with a queue in front of them, so each one has to say what to do next.
   */
  it('turns an auth failure into an instruction', () => {
    expect(explainCheckInError('not authenticated')).toMatch(/Sign in/);
  });

  it('explains scanning somebody else’s event', () => {
    expect(
      explainCheckInError('only the event host can check guests in'),
    ).toMatch(/do not host/);
  });

  it('reports a duplicate as the non-event it is', () => {
    expect(explainCheckInError('ticket has already been checked in')).toBe(
      'This guest is already checked in.',
    );
  });

  it('tells the guest where to reopen an invalid code', () => {
    expect(explainCheckInError('invalid ticket code')).toMatch(/Tickets tab/);
  });

  it('distinguishes a network failure from a bad ticket', () => {
    expect(explainCheckInError('Network request failed')).toMatch(
      /connection/,
    );
  });

  it('passes through anything it does not recognise', () => {
    expect(explainCheckInError('something new')).toBe('something new');
  });

  it('never returns an empty string', () => {
    expect(explainCheckInError('')).toBe('Try scanning again.');
  });
});
