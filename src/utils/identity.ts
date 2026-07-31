/**
 * Provisional identities.
 *
 * Connecting a wallet does not create an account. RLS requires `auth.uid()`,
 * and a wallet signature is not a Supabase session - so a wallet nobody has
 * linked yet resolves to a local, unsaved identity whose id is
 * `wallet:<address>` rather than a profile UUID.
 *
 * That identity is fine for browsing and it is why the app works before you
 * sign in. What it is not is a row, so anything that writes a `profile_id`
 * fails - and it failed *raw*:
 *
 *   Could not send request
 *   invalid input syntax for type uuid: "wallet:CiM2ZRkc..."
 *
 * Postgres is right and the message is useless. Worse, the same cause made an
 * RSVP look like it succeeded and then never appear under Attending, because
 * nothing checked before writing.
 *
 * So: check first, and say the one thing the user can act on - sign in with
 * Google, which is what turns the wallet into an account.
 */

/** True when this id is a placeholder rather than a profile row. */
export function isProvisionalIdentity(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('wallet:');
}

/**
 * The message shown when a provisional identity tries to write.
 *
 * Deliberately names the action rather than the constraint. "Invalid input
 * syntax for type uuid" is true and unactionable; this tells them the one step
 * that fixes it.
 */
export const PROVISIONAL_IDENTITY_MESSAGE =
  'Finish setting up your account first - sign in with Google from your profile. Your wallet stays the same.';

/**
 * Throw unless this identity can own rows.
 *
 * Call before any write keyed on a profile id: RSVPs, friend requests, profile
 * edits, avatar uploads.
 */
export function assertRealIdentity(id: string | null | undefined): asserts id is string {
  if (!id || isProvisionalIdentity(id)) {
    throw new Error(PROVISIONAL_IDENTITY_MESSAGE);
  }
}
