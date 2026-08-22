/**
 * The Google path, in the one place both entry points read it from.
 *
 * Google is reachable from two screens and must be: the signed-out prompt
 * replaces every wallet-dependent screen, and Home's "Connect" opens the sheet
 * directly - so leaving it off either one strands a user with no wallet at a
 * dead end. Both carried their own copy of the handler and the button, which is
 * how their wording drifted apart.
 */

import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { haptics } from '@/utils/haptics';

import { GoogleMark } from './google-account-row';

/**
 * Sign in with Google, reporting the outcome.
 *
 * A *cancelled* sign-in clears the error (see `auth-store`) and gets no toast
 * at all - the user dismissed Google on purpose, and calling that a failure
 * reads as a bug in the app.
 */
export function useGoogleSignIn(onSuccess?: () => void) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  return useCallback(async () => {
    haptics.medium();
    const ok = await signInWithGoogle();

    if (ok) {
      haptics.success();
      const email = useAuthStore.getState().sessionEmail;
      toast.success(
        'Signed in',
        email ? `Welcome, ${email}` : 'Connect a wallet to finish setting up.',
      );
      onSuccess?.();
      return;
    }

    const error = useAuthStore.getState().error;
    if (error) {
      haptics.error();
      toast.error('Google sign-in failed', error);
    }
  }, [signInWithGoogle, onSuccess]);
}

/**
 * The "or / Continue with Google" block itself.
 *
 * `fullWidth` is the signed-out prompt, where this sits under a full-width CTA
 * and stretches to match it; the sheet lets its own padding set the width.
 */
export const GoogleSignInBlock = memo(function GoogleSignInBlock({
  onPress,
  busy,
  disabled,
  hint,
  footnote,
  fullWidth = false,
}: {
  onPress: () => void;
  /** Swaps the mark for a spinner while Google is open. */
  busy: boolean;
  disabled?: boolean;
  /** Read out after the label - what signing in actually buys here. */
  hint: string;
  footnote: string;
  fullWidth?: boolean;
}) {
  return (
    <>
      <View
        className={
          fullWidth
            ? 'my-4 flex-row items-center gap-3 self-stretch'
            : 'my-4 flex-row items-center gap-3'
        }
      >
        <View className="h-px flex-1 bg-white/10" />
        <Text variant="caption" className="text-muted-foreground">
          or
        </Text>
        <View className="h-px flex-1 bg-white/10" />
      </View>

      <PressableScale
        onPress={onPress}
        disabled={disabled ?? busy}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityHint={hint}
        className={
          fullWidth
            ? 'w-full flex-row items-center justify-center gap-2.5 border border-white/12 bg-white/[0.05]'
            : 'flex-row items-center justify-center gap-2.5 border border-white/12 bg-white/[0.05]'
        }
        style={{ height: 52, borderRadius: radius.full }}
      >
        {busy ? <Spinner size={18} /> : <GoogleMark size={18} />}
        <Text style={{ fontFamily: fontFamily.semibold, fontSize: 15 }}>
          {busy ? 'Waiting for Google...' : 'Continue with Google'}
        </Text>
      </PressableScale>

      <Text
        variant="caption"
        className={
          fullWidth
            ? 'mt-3 text-center text-muted-foreground'
            : 'mt-2.5 text-center text-muted-foreground'
        }
      >
        {footnote}
      </Text>
    </>
  );
});
