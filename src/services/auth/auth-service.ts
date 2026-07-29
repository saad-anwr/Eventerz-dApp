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
 * Bind the connected wallet to the signed-in Google account.
 *
 * Atomic on the server: `link_wallet` refuses a wallet already claimed by a
 * different profile rather than racing a read against a write.
 */
export async function linkWallet(
  walletAddress: string,
): Promise<AuthResult<ProfileRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const { data, error } = await supabase.rpc('link_wallet', {
    p_wallet_address: walletAddress,
  });

  if (error) {
    const friendly =
      error.code === '23505'
        ? 'That wallet is already linked to another Eventerz account.'
        : error.message;
    return { ok: false, error: friendly };
  }

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
