/**
 * The check-in vocabulary: how a ticket's QR is written, how a scanned one is
 * read back, and how a failure is explained to whoever is working the door.
 *
 * These three belonged together and were not. `buildCheckInUrl` and
 * `parseQrPayload` lived in `repositories/supabase/rows.ts`, so the mock
 * repository could not reach them without depending on the Supabase layer - and
 * therefore re-implemented the parse by hand, with a regex that had drifted
 * (see `parseQrPayload` below). `explainCheckInError` lived inside `scan.tsx`
 * as a module-private function, so the deep-link screen that performs the exact
 * same redemption could not use it and showed raw Postgres text instead.
 *
 * Nothing here touches the network or the database, which is what lets every
 * caller - mock and live, scanner and deep link - share one definition.
 */

import { siteConfig } from '@/constants';

/**
 * The scannable check-in link for a ticket.
 *
 * # Why this is a URL and not `eventerz:v1:checkin?...`
 *
 * It used to be a bare custom scheme. Nothing outside this app knows what that
 * means, so pointing any ordinary camera at a ticket produced:
 *
 *     QR CODE - No usable data found
 *
 * That is not a cosmetic problem at a door. A host whose scanner will not open,
 * whose phone is the wrong one, or who is simply holding a device with no
 * Eventerz build has no route at all from the code on the guest's screen to a
 * check-in - the credential is right there and unreadable by anything.
 *
 * An `https://` payload is understood by every camera on both platforms. On a
 * phone with the app it opens the app (the intent filter in `app.json`); on any
 * other phone it opens the check-in page on the website, which does the same
 * thing for a signed-in host. The secret travels in the URL either way, exactly
 * as it did before - it is a bearer credential for one ticket and always was.
 */
export function buildCheckInUrl(ticketId: string, secret: string): string {
  return `${siteConfig.url}/checkin?ticket=${ticketId}&secret=${secret}`;
}

/**
 * Parse a scanned QR payload back into its parts.
 *
 * Accepts three shapes, all of which are Eventerz check-in codes:
 *
 *   * `https://<host>/checkin?ticket=..&secret=..` - what tickets carry now.
 *   * `eventerz://checkin?...` - the app's own deep link.
 *   * `eventerz:v1:checkin?...` - what tickets minted before this change
 *     carry. Those are in people's wallets and cannot be re-issued, so
 *     dropping support would break every ticket already sold.
 *
 * The host is deliberately not checked against `siteConfig.url`. A preview
 * deploy, a custom domain and the production site all mint valid tickets, and
 * the credential that matters is the secret - which the server verifies. Being
 * strict about the domain here would reject real tickets to prevent nothing:
 * an attacker who can choose the domain can equally choose to omit it.
 *
 * # The divergence this file exists to end
 *
 * The mock repository carried its own copy of this, above a comment promising
 * it was "kept in step deliberately: a scanner that works against the mock and
 * fails against Supabase is worse than one that fails in both". It had not been
 * kept in step. The copy matched on `ticket` alone and never looked for
 * `secret`, so a truncated code - the realistic failure, from a half-scanned or
 * creased QR - checked a guest in against the mock and was rejected as invalid
 * against the real database. That is precisely the split the comment set out to
 * prevent, which is the argument for one implementation rather than two that
 * agree by inspection.
 */
export function parseQrPayload(
  payload: string,
): { ticketId: string; secret: string } | null {
  const trimmed = payload.trim();

  const looksLikeOurs =
    /^https?:\/\/[^\s]+\/checkin\?/i.test(trimmed) ||
    /^eventerz:(\/\/)?(v1:)?checkin\?/i.test(trimmed);
  if (!looksLikeOurs) return null;

  const ticketId = /[?&]ticket=([0-9a-f-]+)/i.exec(trimmed)?.[1];
  const secret = /[?&]secret=([0-9a-f-]+)/i.exec(trimmed)?.[1];
  if (!ticketId || !secret) return null;
  return { ticketId, secret };
}

/**
 * Turn a check-in failure into something an operator can act on at a door.
 *
 * `check_in_ticket` (migration 0002) raises in Postgres' voice: "only the event
 * host can check guests in", "not authenticated", "invalid ticket code". Two of
 * those describe a state the person holding the phone can fix, and none of them
 * says how. With a queue waiting, "invalid ticket code" is indistinguishable
 * from "the app is broken".
 *
 * The mapping is on the message rather than the SQLSTATE because the errors
 * arrive through PostgREST and supabase-js as text by the time they get here.
 */
export function explainCheckInError(message: string): string {
  if (/not authenticated|sign in|28000/i.test(message)) {
    return 'Sign in with Google on this device first - check-in is recorded against you as the host.';
  }
  if (/only the event host/i.test(message)) {
    return 'That ticket is for an event you do not host. Only the host can check its guests in.';
  }
  if (/already been checked in|already checked in/i.test(message)) {
    return 'This guest is already checked in.';
  }
  if (/invalid ticket code|ticket not found|could not find that ticket/i.test(message)) {
    return 'That code did not match a valid ticket. Ask the guest to reopen it from their Tickets tab.';
  }
  if (/not an Eventerz ticket/i.test(message)) {
    return 'That QR is not an Eventerz ticket.';
  }
  if (/network|fetch|timeout/i.test(message)) {
    return 'Could not reach the server. Check your connection and scan again.';
  }
  return message || 'Try scanning again.';
}
