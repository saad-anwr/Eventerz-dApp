/**
 * "Link a Google account" row for Settings.
 *
 * Google is a *secondary* credential here: the wallet remains the identity, and
 * linking Google is what makes that identity recoverable on a new device. The
 * copy says so, because a user who thinks Google is their login will be
 * confused when the wallet is what actually gates on-chain actions.
 */

import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight, Info } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { toast } from '@/store/toast-store';
import { useAuthStore } from '@/store/auth-store';
import { useWalletStore } from '@/store/wallet-store';
import { brand } from '@/theme/colors';
import { TOUCH_TARGET, radius } from '@/theme/layout';
import { haptics } from '@/utils/haptics';

/** Google's mark, inline so it needs no asset and stays crisp. */
const GoogleMark = memo(function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.97A11.99 11.99 0 0 0 12 24Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.6 14.71a7.2 7.2 0 0 1 0-4.42V7.32H1.76a12 12 0 0 0 0 10.36l3.84-2.97Z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.68 0 3.19.58 4.38 1.72l3.28-3.28C17.7 1.2 15.1 0 12 0A11.99 11.99 0 0 0 1.76 7.32L5.6 10.3C6.5 7.58 9.02 4.75 12 4.75Z"
      />
    </Svg>
  );
});

export const GoogleAccountRow = memo(function GoogleAccountRow() {
  const isLive = useAuthStore((s) => s.isLive);
  const status = useAuthStore((s) => s.status);
  const profile = useAuthStore((s) => s.profile);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOutGoogle = useAuthStore((s) => s.signOut);
  const walletAddress = useWalletStore((s) => s.account?.address ?? null);

  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const linked = status === 'linked' && Boolean(profile);
  const linking = status === 'linking';

  const handleLink = useCallback(async () => {
    haptics.medium();
    const ok = await signInWithGoogle();

    if (ok) {
      haptics.success();
      const email = useAuthStore.getState().profile?.email;
      toast.success(
        'Google account linked',
        email ? `Signed in as ${email}` : 'Your account is now recoverable.',
      );
      return;
    }

    const error = useAuthStore.getState().error;
    // A cancelled sign-in clears the error and needs no toast.
    if (error) {
      haptics.error();
      toast.error('Could not link Google', error);
    }
  }, [signInWithGoogle]);

  const handleUnlink = useCallback(async () => {
    setConfirmUnlink(false);
    await signOutGoogle();
    haptics.success();
    toast.info(
      'Google account unlinked',
      'Your wallet and on-chain history are untouched.',
    );
  }, [signOutGoogle]);

  return (
    <>
      <PressableFade
        onPress={linked ? () => setConfirmUnlink(true) : handleLink}
        disabled={linking}
        accessibilityRole="button"
        accessibilityLabel={
          linked
            ? `Google account linked${profile?.email ? `, ${profile.email}` : ''}. Tap to unlink.`
            : 'Link a Google account'
        }
        accessibilityHint={
          linked
            ? 'Removes the Google account from this wallet'
            : 'Opens Google sign-in so this account can be recovered on another device'
        }
        className="flex-row items-center gap-3 py-3.5"
        style={{ minHeight: TOUCH_TARGET }}
      >
        <View
          className="items-center justify-center bg-white/[0.06]"
          style={{ width: 36, height: 36, borderRadius: radius.md }}
        >
          <GoogleMark size={17} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="title">Google account</Text>
            {linked && (
              <Badge label="Linked" variant="green" size="sm" icon={Check} />
            )}
          </View>
          <Text
            variant="caption"
            className="mt-0.5 text-muted-foreground"
            numberOfLines={1}
          >
            {linking
              ? 'Waiting for Google…'
              : linked
                ? (profile?.email ?? 'Signed in')
                : isLive
                  ? 'Recover this account on another device'
                  : 'Not configured — see docs/AUTH_SETUP.md'}
          </Text>
        </View>

        {linking ? (
          <Spinner size={18} />
        ) : (
          <ChevronRight size={16} color="#64748b" strokeWidth={2.2} />
        )}
      </PressableFade>

      {/* Explain the model once the account is linked but no wallet exists. */}
      {linked && !walletAddress && (
        <View
          className="mb-3 flex-row items-start gap-2.5 border border-amber-400/25 bg-amber-400/[0.07] p-3"
          style={{ borderRadius: radius.lg }}
        >
          <Info size={14} color="#fbbf24" strokeWidth={2.2} />
          <Text variant="caption" className="flex-1 text-muted-foreground">
            Connect a wallet to finish setting up. Google alone cannot RSVP
            on-chain, mint tickets or check in.
          </Text>
        </View>
      )}

      <Modal
        visible={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        title="Unlink Google?"
        subtitle="Your wallet stays connected and your tickets, badges and reputation are unaffected — they live on-chain. You will lose the ability to recover this profile with Google."
        dismissOnBackdrop={false}
      >
        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setConfirmUnlink(false)}
            className="flex-1"
          />
          <Button
            label="Unlink"
            variant="danger"
            onPress={handleUnlink}
            className="flex-1"
          />
        </View>
      </Modal>
    </>
  );
});

export { GoogleMark };
export const GOOGLE_ACCENT = brand.blue;
