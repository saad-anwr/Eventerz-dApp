/**
 * Google sign-in for React Native.
 *
 * Flow (PKCE - the only correct choice for a public client, since a mobile app
 * cannot keep a client secret):
 *
 *   1. Ask Supabase for the Google consent URL, telling it to return to our
 *      deep link rather than a web page.
 *   2. Open it in an in-app browser tab (`openAuthSessionAsync`), which shares
 *      cookies with the system browser so an already-signed-in Google account
 *      needs one tap, and closes itself on redirect.
 *   3. Google -> Supabase -> `eventerz://auth/callback?code=...`
 *   4. Exchange the code for a session. The verifier never leaves the device.
 *
 * Everything returns a discriminated result rather than throwing - each failure
 * here is user-facing (consent denied, browser dismissed, no network).
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { APP_SCHEME } from '@/constants/config';

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client';
import type { ProfileRow, ProfileUpdate } from './types';
import { PROFILE_COLUMNS, asProfileRow } from '@/services/auth/types';

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; cancelled?: boolean };

/**
 * Shown when the build has no backend credentials.
 *
 * Deliberately says nothing about environment variables or setup docs. This is
 * a deployment fault, but it is read by whoever is holding the phone - and one
 * of them is a store reviewer, for whom a message naming `EXPO_PUBLIC_*` and a
 * path in the repo is indistinguishable from an unfinished app. The build log
 * is where the operator finds out; see `scripts/check-build-env.mjs`, which
 * fails the build before an artifact like this can exist.
 */
const NOT_CONFIGURED =
  'Sign-in is unavailable right now. You can still connect a wallet to continue.';

/**
 * Where Google returns the user. Must be registered in Supabase ->
 * Authentication -> URL Configuration -> Redirect URLs, exactly as produced here.
 */
export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback', { scheme: APP_SCHEME });
}

/** Pull the `code` out of the deep link Supabase redirected us to. */
function extractCode(url: string): string | null {
  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code;
  return typeof code === 'string' ? code : null;
}

function extractError(url: string): string | null {
  const { queryParams } = Linking.parse(url);
  const description = queryParams?.error_description ?? queryParams?.error;
  return typeof description === 'string' ? description : null;
}

/* -------------------------------------------------------------------------- */
/*  Exchanging the code exactly once                                           */
/* -------------------------------------------------------------------------- */

/**
 * In-flight and completed exchanges, keyed by authorization code.
 *
 * # The bug this exists to kill
 *
 * On Android a successful sign-in arrives **twice**. `openAuthSessionAsync`
 * captures the redirect and resolves with the URL, *and* the OS separately
 * matches `eventerz://auth/callback` against the app's intent filter and hands
 * it to Expo Router, which mounts `app/auth/callback.tsx`. Both paths then hold
 * the same one-time code and both used to exchange it.
 *
 * `exchangeCodeForSession` consumes the server-side flow state. Whichever call
 * lost the race got:
 *
 *     invalid flow state, no valid flow state found
 *
 * which the connect sheet showed as "Google sign-in failed" - on a sign-in that
 * had in fact just succeeded, because the winner had already stored the
 * session. The user saw a red error, and was signed in.
 *
 * The callback screen tried to avoid this with a `getSession()` check before
 * exchanging, but a check-then-act across two independent callers is not a
 * lock: both read "no session" before either had written one.
 *
 * # Why a map and not a boolean
 *
 * A single "exchange in progress" flag would serialise two *different* sign-in
 * attempts, and the second would join the first's result - signing the user
 * into an account they did not pick. Keying on the code means only the callers
 * racing over the *same* code share a result, which is exactly the set that
 * should.
 *
 * Entries are kept after they settle rather than cleared. A code is single-use,
 * so the map is bounded by the number of sign-in attempts in one app session,
 * and keeping the settled result means the loser of a late race is handed the
 * winner's answer instead of starting a second doomed exchange.
 */
const exchanges = new Map<string, Promise<AuthResult<void>>>();

/** Defensive bound. Nobody signs in 50 times per launch; if they somehow do,
    drop the oldest rather than grow without limit. */
const MAX_TRACKED_EXCHANGES = 50;

async function runExchange(code: string): Promise<AuthResult<void>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return { ok: true, data: undefined };

  /*
   * A failed exchange does not mean a failed sign-in.
   *
   * The redirect can be delivered twice by routes this process does not
   * control - a cold start racing a warm one, or a browser that re-fires the
   * intent. If a session exists by now, the code was spent by a call that
   * worked and there is nothing wrong to report. Reporting it anyway is the
   * whole visible bug.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return { ok: true, data: undefined };

  return { ok: false, error: error.message };
}

/**
 * Exchange an OAuth code for a session, at most once per code.
 *
 * Safe to call from every path that might receive the redirect; the second and
 * later callers await the first one's result rather than racing it.
 */
export function exchangeAuthCode(code: string): Promise<AuthResult<void>> {
  const existing = exchanges.get(code);
  if (existing) return existing;

  const pending = runExchange(code);
  exchanges.set(code, pending);

  if (exchanges.size > MAX_TRACKED_EXCHANGES) {
    const oldest = exchanges.keys().next();
    if (!oldest.done) exchanges.delete(oldest.value);
  }

  return pending;
}

/**
 * Run the full Google sign-in flow.
 *
 * Resolves only once the session exists (or the user backed out), so callers can
 * await it and immediately read the signed-in profile.
 */
/**
 * Force Google's account chooser on the next sign-in.
 *
 * Set when the user signs out, and only then. See `signInWithGoogle` for why
 * the chooser is otherwise suppressed.
 */
let forceAccountChooser = false;

export async function signInWithGoogle(): Promise<AuthResult<ProfileRow | null>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const redirectTo = authRedirectUrl();

  /*
   * `prompt: 'select_account'` used to be sent on every attempt, which meant
   * somebody already signed in to Google in Chrome - the overwhelmingly common
   * case, and the one the shared cookie jar exists to serve - was still made to
   * pick their account out of a list before anything happened. "Already signed
   * in on the web, signs straight in on the phone" is the behaviour wanted, and
   * an unconditional chooser is precisely what prevents it.
   *
   * Dropping it does not trap anyone on one account: Google still shows the
   * chooser whenever the browser holds more than one session or consent has not
   * been granted, and signing out here sets the flag that asks for it
   * explicitly. That covers switching accounts, which is the only thing the
   * unconditional version bought.
   */
  const queryParams: Record<string, string> = { access_type: 'offline' };
  if (forceAccountChooser) queryParams.prompt = 'select_account';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // We drive the browser ourselves - Supabase must not try to navigate.
      skipBrowserRedirect: true,
      queryParams,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.url) {
    return { ok: false, error: 'Google did not return a sign-in URL.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    // Reuse the system browser session so an existing Google login is one tap.
    preferEphemeralSession: false,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, error: 'Sign-in cancelled.', cancelled: true };
  }

  if (result.type !== 'success') {
    return { ok: false, error: 'Sign-in did not complete.' };
  }

  const oauthError = extractError(result.url);
  if (oauthError) return { ok: false, error: oauthError };

  const code = extractCode(result.url);
  if (!code) {
    return { ok: false, error: 'Google did not return an authorization code.' };
  }

  // Shared with the deep-link route, which may be handed the same code by the
  // OS. Whichever arrives second gets this one's answer.
  const exchange = await exchangeAuthCode(code);
  if (!exchange.ok) return { ok: false, error: exchange.error };

  forceAccountChooser = false;
  const profile = await getMyProfile();
  return { ok: true, data: profile };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };

  // Someone who deliberately signed out is the one person who might be
  // switching accounts, so the next attempt asks which.
  forceAccountChooser = true;
  return { ok: true, data: undefined };
}

/**
 * Delete the signed-in account.
 *
 * # Why the app needs this at all
 *
 * The website has offered account deletion since 0015; the app did not, and
 * that is not merely a parity gap. Google Play requires any app that lets
 * people create an account to offer deletion **from inside the app** - a link
 * to a website does not satisfy it - so shipping without this is a review
 * rejection waiting to happen, on top of being the wrong answer to someone who
 * asks to leave.
 *
 * Calls the same `delete-account` Edge Function as the web client, which erases
 * the private rows and anonymises the profile (`delete_my_account()`, migration
 * 0015) and then removes the `auth.users` row with the service-role key. Both
 * halves need privileges a client does not have, which is why this is one call
 * to a function rather than a sequence of queries.
 *
 * What survives is deliberate and worth being able to explain to the person
 * tapping the button: events they hosted, other people's tickets to those
 * events, and payment receipts. Those are other people's records, and deleting
 * them would erase a guest's ticket to punish nobody. Everything that
 * identifies the user - name, avatar, bio, email, wallet link - is cleared.
 */
export async function deleteAccount(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'You are not signed in.' };

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  /*
   * A non-2xx arrives as a generic FunctionsHttpError, so the body carries the
   * useful part. The `partial` case is the one that matters: the data is gone
   * but the sign-in is not, and telling someone "deleted" when they can still
   * log in is the single wrong answer here.
   */
  if (error) {
    const detail =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'Could not delete your account. Please try again.';
    return { ok: false, error: detail };
  }

  /*
   * The account is gone; clear the local session so nothing keeps using a token
   * whose user no longer exists.
   *
   * Guarded, because by this point the deletion has already succeeded. A bare
   * await meant a failing local sign-out - the very thing that cannot matter
   * any more, since the user it authenticates no longer exists - propagated out
   * and turned a completed deletion into a reported failure. The caller would
   * then show an error and invite a retry on an account that is not there.
   *
   * Signing out locally is cleanup. It cannot be allowed to contradict the
   * result it is cleaning up after.
   */
  try {
    await supabase.auth.signOut();
  } catch (signOutError) {
    console.warn('[auth] session cleanup after delete failed', signOutError);
  }
  return { ok: true, data: undefined };
}

/** Restore a persisted session on launch. Null when signed out. */
export async function getSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .single();

  return data;
}

export async function updateMyProfile(
  patch: ProfileUpdate,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Bind the connected wallet to the signed-in Google account, after proving it is
 * theirs.
 *
 * Three steps, none skippable:
 *
 *   1. `issue_wallet_link_nonce` mints a single-use challenge bound to this
 *      account and this address, valid for five minutes.
 *   2. The wallet signs that exact text. This is what the old implementation
 *      never did - it took an address on trust, so any signed-in user could
 *      claim any unclaimed wallet they could read off the explorer, along with
 *      its reputation and ticket history.
 *   3. The `link-wallet` Edge Function verifies the signature (Postgres has no
 *      Ed25519) and calls a function revoked from `authenticated`, so there is
 *      no path to a linked wallet that bypasses the check.
 *
 * `signMessage` is injected rather than imported so this module stays free of
 * the wallet adapter - which is Android-only and needs a dev build, neither of
 * which an auth service should care about.
 */
export async function linkWallet(
  walletAddress: string,
  signMessage: (message: string) => Promise<string>,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data: challenge, error: challengeError } = await supabase.rpc(
    'issue_wallet_link_nonce',
    { p_wallet_address: walletAddress },
  );

  if (challengeError) {
    const friendly =
      challengeError.code === '23505'
        ? 'That wallet is already linked to another Eventerz account.'
        : challengeError.message;
    return { ok: false, error: friendly };
  }

  try {
    const message = challenge as string;
    // MWA returns a base64 signature, which the Edge Function accepts as-is -
    // it takes base58 or base64 precisely so neither client needs a base58
    // implementation just to post a signature.
    const signature = await signMessage(message);

    const { data, error } = await supabase.functions.invoke('link-wallet', {
      body: { walletAddress, message, signature },
    });

    if (error) {
      /*
       * `FunctionsHttpError.message` is always "Edge Function returned a
       * non-2xx status code". The message worth showing is in the response
       * body, which the function writes for exactly this purpose.
       */
      const response = (error as { context?: Response }).context;
      let detail: string | null = null;
      if (response && typeof response.json === 'function') {
        try {
          const body = await response.json();
          if (typeof body?.error === 'string') detail = body.error;
        } catch {
          /* not JSON - fall through to the generic message */
        }
      }
      return { ok: false, error: detail ?? 'Could not verify that wallet.' };
    }

    const profile = (data as { profile?: ProfileRow } | null)?.profile;
    if (!profile) return { ok: false, error: 'Could not verify that wallet.' };
    return { ok: true, data: profile };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Wallet verification failed.';
    // Declining the signature is a choice, not a fault.
    if (/user rejected|denied|declined|cancell?ed/i.test(message)) {
      return { ok: false, error: 'Wallet verification was cancelled.' };
    }
    return { ok: false, error: message };
  }
}

/** One wallet on the signed-in account. */
export type LinkedWallet = {
  address: string;
  isPrimary: boolean;
  label: string | null;
  linkedAt: string;
};

/**
 * Every wallet linked to the signed-in account, primary first.
 *
 * The set, not `profiles.wallet_address`. That column holds only the primary,
 * which is why anything that used it as "is this wallet linked?" answered no
 * for every wallet after the first - and then tried to link an already-linked
 * wallet, asking the user to sign for something they had already signed for.
 */
export async function myWallets(): Promise<LinkedWallet[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('my_wallets');
  if (error || !data) return [];

  return (data as {
    address: string;
    is_primary: boolean;
    label: string | null;
    linked_at: string;
  }[]).map((row) => ({
    address: row.address,
    isPrimary: row.is_primary,
    label: row.label,
    linkedAt: row.linked_at,
  }));
}

/**
 * Detach one wallet, leaving the account and its other wallets intact.
 *
 * Omitting the address removes the primary, which is what the old no-argument
 * `unlinkWallet()` meant when an account could only hold one.
 */
export async function unlinkWallet(
  walletAddress?: string,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = walletAddress
    ? await supabase.rpc('unlink_wallet_address', {
        p_wallet_address: walletAddress,
      })
    : await supabase.rpc('unlink_wallet');

  if (error) return { ok: false, error: error.message };

  /*
   * Checked rather than cast: these RPCs return a bare composite, which is one
   * row of NULLs when nothing matched rather than no row at all. See
   * `asProfileRow`. Reporting failure is right here - the wallet may well have
   * been detached, but we were not handed a profile to show for it, and
   * adopting a row with a null id as the user's identity is how a placeholder
   * ends up in a uuid column.
   */
  const row = asProfileRow(data);
  if (!row) {
    return { ok: false, error: 'That wallet could not be removed. Try again.' };
  }
  return { ok: true, data: row };
}

/** Promote one of the account's wallets to primary. */
export async function setPrimaryWallet(
  walletAddress: string,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase.rpc('set_primary_wallet', {
    p_wallet_address: walletAddress,
  });
  if (error) return { ok: false, error: error.message };

  // Same shape hazard as `unlinkWallet` above - see `asProfileRow`.
  const row = asProfileRow(data);
  if (!row) {
    return { ok: false, error: 'That wallet could not be made primary. Try again.' };
  }
  return { ok: true, data: row };
}

/*
 * Resolving the account that owns a wallet lives in
 * `repositories/supabase/index.ts` (`ensureWalletUser`), which calls the same
 * `profile_for_wallet` RPC and is what the app actually reads. A second copy
 * used to sit here.
 *
 * `wallet_link_status` (0022) is granted to `anon` and `authenticated` and is
 * still the right call for "is this address already claimed, and by me?" - it
 * simply has no caller yet.
 */

export { isSupabaseConfigured };
