/**
 * The Google half of the access model.
 *
 * # The model this enforces
 *
 * Two credentials, each unlocking a different half of the product:
 *
 *   * **Google** is the account. It carries the profile, the social graph and
 *     recovery, so anything involving other people - friends, requests, direct
 *     messages - needs it. A keypair is free to mint by the thousand, which
 *     makes a wallet the wrong thing to hang a social graph off; a Google
 *     account has a real cost and a way back in when a device is lost.
 *   * **A wallet** is for the chain. RSVPs claim an on-chain seat and tickets
 *     are cNFTs, so those need a signer - and there is nothing Google can
 *     substitute for a signature.
 *
 * Everything else - browsing, searching and opening events - needs neither, and
 * is deliberately reachable with no credential at all.
 *
 * The intended end state is a user holding both, arrived at by wanting something
 * on each side rather than by being asked for both up front. So this gate never
 * blocks a screen a wallet-only user could otherwise use; it guards the social
 * surface specifically, and says which credential is missing and why.
 *
 * `WalletGate`'s counterpart lives in `features/wallet/use-connect-wallet.ts`.
 */

import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { GoogleMark } from '@/features/wallet/google-account-row';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { screenPadding } from '@/theme/layout';
import { haptics } from '@/utils/haptics';

/**
 * True when the signed-in state satisfies the Google requirement.
 *
 * `isLive` is part of it on purpose: with no Supabase project configured there
 * is no account to sign into, and prompting for one would offer a button that
 * cannot work.
 */
export function useHasGoogleAccount(): boolean {
  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  return Boolean(isLive && profile);
}

export const GoogleGate = memo(function GoogleGate({
  title = 'Sign in to see your community',
  description = 'Friends, requests and messages live on your Google account - it is what makes your profile discoverable and recoverable. Your wallet stays connected and keeps handling tickets and RSVPs.',
}: {
  title?: string;
  description?: string;
}) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const linking = useAuthStore((s) => s.status === 'linking');
  const [busy, setBusy] = useState(false);

  const handleSignIn = useCallback(async () => {
    haptics.medium();
    setBusy(true);
    const ok = await signInWithGoogle();
    setBusy(false);

    if (ok) {
      haptics.success();
      const email = useAuthStore.getState().sessionEmail;
      toast.success('Signed in', email ? `Welcome, ${email}` : undefined);
      return;
    }

    // A cancelled sign-in leaves no error and warrants no toast - the user
    // backed out on purpose.
    const error = useAuthStore.getState().error;
    if (error) {
      haptics.error();
      toast.error('Google sign-in failed', error);
    }
  }, [signInWithGoogle]);

  return (
    <View
      className="flex-1 items-center justify-center gap-4"
      style={{ paddingHorizontal: screenPadding, paddingBottom: 48 }}
    >
      <View className="items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-5">
        <GoogleMark size={28} />
      </View>

      <Text variant="h3" className="text-center">
        {title}
      </Text>
      <Text
        variant="body"
        className="text-center text-muted-foreground"
        style={{ maxWidth: 330 }}
      >
        {description}
      </Text>

      <Button
        label={busy || linking ? 'Waiting for Google...' : 'Continue with Google'}
        onPress={handleSignIn}
        loading={busy || linking}
        disabled={busy || linking}
        className="mt-2"
        style={{ minWidth: 240 }}
      />
    </View>
  );
});
