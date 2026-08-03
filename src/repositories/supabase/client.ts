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
 * without credentials, which is a deployment fault rather than a user one - so
 * it says what to set rather than what went wrong.
 */
export function client() {
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
export function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ?? `${context} failed.`);
}
