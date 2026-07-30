/**
 * Google sign-in for React Native.
 *
 * Flow (PKCE — the only correct choice for a public client, since a mobile app
 * cannot keep a client secret):
 *
 *   1. Ask Supabase for the Google consent URL, telling it to return to our
 *      deep link rather than a web page.
 *   2. Open it in an in-app browser tab (`openAuthSessionAsync`), which shares
 *      cookies with the system browser so an already-signed-in Google account
 *      needs one tap, and closes itself on redirect.
 *   3. Google → Supabase → `eventerz://auth/callback?code=…`
 *   4. Exchange the code for a session. The verifier never leaves the device.
 *
 * Everything returns a discriminated result rather than throwing — each failure
 * here is user-facing (consent denied, browser dismissed, no network).
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { APP_SCHEME } from '@/constants/config';

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client';
import type { ProfileRow, ProfileUpdate } from './types';

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; cancelled?: boolean };

const NOT_CONFIGURED =
  'Sign-in is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY — see docs/AUTH_SETUP.md.';

/**
 * Where Google returns the user. Must be registered in Supabase →
 * Authentication → URL Configuration → Redirect URLs, exactly as produced here.
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

/**
 * Run the full Google sign-in flow.
 *
 * Resolves only once the session exists (or the user backed out), so callers can
 * await it and immediately read the signed-in profile.
 */
export async function signInWithGoogle(): Promise<AuthResult<ProfileRow | null>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const redirectTo = authRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // We drive the browser ourselves — Supabase must not try to navigate.
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
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

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return { ok: false, error: exchangeError.message };

  const profile = await getMyProfile();
  return { ok: true, data: profile };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
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
    .select('*')
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
    .select()
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
 *      never did — it took an address on trust, so any signed-in user could
 *      claim any unclaimed wallet they could read off the explorer, along with
 *      its reputation and ticket history.
 *   3. The `link-wallet` Edge Function verifies the signature (Postgres has no
 *      Ed25519) and calls a function revoked from `authenticated`, so there is
 *      no path to a linked wallet that bypasses the check.
 *
 * `signMessage` is injected rather than imported so this module stays free of
 * the wallet adapter — which is Android-only and needs a dev build, neither of
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
    // MWA returns a base64 signature, which the Edge Function accepts as-is —
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
          /* not JSON — fall through to the generic message */
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

/** Detach the wallet from this account, leaving the account intact. */
export async function unlinkWallet(): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase.rpc('unlink_wallet');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ProfileRow };
}

/** Find the account that already owns a wallet, for the recovery path. */
export async function profileForWallet(
  walletAddress: string,
): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  return data;
}

export { isSupabaseConfigured };
