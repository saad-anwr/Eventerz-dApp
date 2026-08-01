/**
 * OAuth landing route.
 *
 * # Why this file has to exist
 *
 * `signInWithGoogle` drives the browser itself with
 * `WebBrowser.openAuthSessionAsync`, which captures the redirect and exchanges
 * the code. That part worked. What it does not control is Android: the redirect
 * is `eventerz://auth/callback?code=...`, the app declares an intent filter for
 * the `eventerz` scheme, so the OS *also* hands the URL to the app and Expo
 * Router navigates to `/auth/callback`.
 *
 * There was no such route. So a successful sign-in showed the success toast and
 * the 404 screen at the same time - which is exactly what it looked like:
 * "signing only shows successful but throws on a blank page".
 *
 * # Why it does more than redirect
 *
 * Redirecting alone would fix the visible symptom and leave a real one behind.
 * If the browser hand-off is interrupted - the app is killed while Google is
 * open, or the OS routes the deep link to a cold start - then
 * `openAuthSessionAsync` never returns and the code is never exchanged. In that
 * path this screen is the only thing holding a valid authorization code, so it
 * completes the exchange itself.
 *
 * `exchangeCodeForSession` is safe to reach twice: the second call fails
 * because the code is spent, and by then a session already exists, which is why
 * the session check comes first.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { getSupabaseClient } from '@/services/auth/supabase-client';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';

/**
 * Turn a Supabase auth error into something a person can act on.
 *
 * Supabase's messages are written for whoever is integrating it, not for whoever
 * is signing in. The commonest one reads "PKCE code verifier not found in
 * storage. This can happen if the auth flow was initiated in a different
 * browser or device" - accurate, and it tells the user nothing they can do.
 *
 * The raw text is dropped rather than appended. Someone who cannot sign in is
 * not helped by a sentence about code verifiers, and showing it invites them to
 * paste an internal detail into a support message instead of the one fact that
 * matters, which is that starting again works.
 */
function explainAuthError(message: string): string {
  if (/code verifier|code_verifier/i.test(message)) {
    return 'This sign-in link belongs to a different attempt. Tap Continue with Google again to start a fresh one.';
  }
  if (/expired|invalid.*code|already.*used/i.test(message)) {
    return 'That sign-in link has expired. Tap Continue with Google to get a new one.';
  }
  if (/network|fetch|timeout/i.test(message)) {
    return 'Could not reach the sign-in service. Check your connection and try again.';
  }
  return 'Something went wrong finishing sign-in. Please try again.';
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  // Deep links can re-deliver while this screen is mounted; the exchange must
  // not run twice.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const finish = async () => {
      const supabase = getSupabaseClient();
      const failure = params.error_description ?? params.error;

      if (failure) {
        toast.error('Sign-in failed', String(failure));
      } else if (supabase && params.code) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Only exchange when the browser hand-off did not already do it.
        if (!session) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            String(params.code),
          );
          if (error) {
            toast.error('Sign-in failed', explainAuthError(error.message));
          }
        }

        await useAuthStore.getState().restore();
        // A Google session may now own the wallet's profile row, so re-resolve
        // the identity rather than leaving the pre-sign-in one on screen.
        await useWalletStore.getState().refreshUser();
      }

      router.replace('/(tabs)');
    };

    void finish();
  }, [params.code, params.error, params.error_description, router]);

  return (
    <View
      className="flex-1 items-center justify-center gap-4"
      style={{ backgroundColor: '#050816' }}
    >
      <Spinner />
      <Text variant="body" className="text-muted-foreground">
        Finishing sign-in...
      </Text>
    </View>
  );
}
