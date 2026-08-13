/**
 * The two helpers every Supabase-backed repository in this folder needs.
 *
 * Each module used to carry its own copy, which is how five slightly different
 * "Supabase is not configured" messages ended up in the app - the same failure
 * read differently depending on which screen hit it first.
 */

import { getSupabaseClient } from '@/services/auth/supabase-client';

/**
 * The configured client, or a throw.
 *
 * A repository call reaching this point with no client means the build shipped
 * without credentials - a deployment fault rather than a user one. It used to
 * say so in those terms, naming the two `EXPO_PUBLIC_*` variables to set, which
 * is useless to the only person who can read it: whoever is holding the phone.
 * To a store reviewer it reads as an unfinished app, and it is the message they
 * would meet on every screen at once.
 *
 * The operator's copy of this belongs in the build log, and it is already
 * there - `scripts/check-build-env.mjs` fails an EAS build that is missing
 * either variable, so an artifact that can reach this line should not exist.
 */
export function client() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Eventerz could not reach its servers.');
  }
  return supabase;
}

/** Turn a PostgREST error into something worth showing a user. */
export function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ?? `${context} failed.`);
}
