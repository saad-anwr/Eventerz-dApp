/**
 * Signed-out call to action.
 *
 * Shown in place of wallet-dependent content (Tickets, Profile) instead of an
 * empty list, so the signed-out state still explains the product rather than
 * looking broken.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { ShieldCheck, Ticket, Trophy, Wallet } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { brand, gradients } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { haptics } from '@/utils/haptics';

import { GoogleMark } from './google-account-row';

const BENEFITS = [
  { icon: Ticket, label: 'NFT tickets land in your wallet' },
  { icon: Trophy, label: 'Attendance builds portable reputation' },
  { icon: ShieldCheck, label: 'You approve every transaction' },
] as const;

export const ConnectWalletPrompt = memo(function ConnectWalletPrompt({
  title = 'Connect your wallet',
  description = 'Your wallet is your Eventerz identity - no email, no password, no bots.',
  onConnect,
}: {
  title?: string;
  description?: string;
  onConnect: () => void;
}) {
  const isLive = useAuthStore((s) => s.isLive);
  const linking = useAuthStore((s) => s.status === 'linking');
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const handleGoogle = useCallback(async () => {
    haptics.medium();
    const ok = await signInWithGoogle();

    if (ok) {
      haptics.success();
      const email = useAuthStore.getState().profile?.email;
      toast.success(
        'Signed in',
        email ? `Welcome, ${email}` : 'Connect a wallet to finish setting up.',
      );
      return;
    }

    // A cancelled sign-in clears the error and needs no toast.
    const error = useAuthStore.getState().error;
    if (error) {
      haptics.error();
      toast.error('Google sign-in failed', error);
    }
  }, [signInWithGoogle]);

  return (
    <Animated.View
      entering={FadeInDown.duration(420)}
      className="items-center"
      style={{ paddingHorizontal: screenPadding, paddingVertical: 40 }}
    >
      <View
        className="items-center justify-center overflow-hidden"
        style={{ width: 78, height: 78, borderRadius: radius['2xl'] }}
      >
        <LinearGradient
          colors={[...gradients.brandSoft.colors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <View
          className="absolute inset-0 border border-brand-purple/30"
          style={{ borderRadius: radius['2xl'] }}
        />
        <Wallet size={32} color={brand.purple} strokeWidth={1.7} />
      </View>

      <Text variant="h2" className="mt-6 text-center">
        {title}
      </Text>

      <Text
        variant="body"
        className="mt-2.5 text-center text-muted-foreground"
        style={{ maxWidth: 320 }}
      >
        {description}
      </Text>

      <View className="mt-7 w-full gap-3" style={{ maxWidth: 340 }}>
        {BENEFITS.map(({ icon: Icon, label }) => (
          <View key={label} className="flex-row items-center gap-3">
            <View
              className="items-center justify-center bg-white/[0.06]"
              style={{ width: 30, height: 30, borderRadius: radius.md }}
            >
              <Icon size={14} color={brand.cyan} strokeWidth={2.2} />
            </View>
            <Text variant="bodySm" className="flex-1 text-muted-foreground">
              {label}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label="Connect wallet"
        icon={Wallet}
        onPress={onConnect}
        size="lg"
        fullWidth
        className="mt-8"
        style={{ maxWidth: 340 }}
        accessibilityHint="Opens the wallet picker"
      />

      {/*
        Google has to be reachable from here. Every signed-out screen renders
        this prompt instead of its header, so without it the only route to
        account recovery - Settings -> Account recovery - is behind the very
        wallet connection the user has not made yet.
      */}
      {isLive && (
        <View className="w-full items-center" style={{ maxWidth: 340 }}>
          <View className="my-4 flex-row items-center gap-3 self-stretch">
            <View className="h-px flex-1 bg-white/10" />
            <Text variant="caption" className="text-muted-foreground">
              or
            </Text>
            <View className="h-px flex-1 bg-white/10" />
          </View>

          <PressableScale
            onPress={handleGoogle}
            disabled={linking}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityHint="Signs in so this account can be recovered on another device"
            className="w-full flex-row items-center justify-center gap-2.5 border border-white/12 bg-white/[0.05]"
            style={{ height: 52, borderRadius: radius.full }}
          >
            {linking ? <Spinner size={18} /> : <GoogleMark size={18} />}
            <Text
              style={{ fontFamily: fontFamily.semibold, fontSize: 15 }}
            >
              {linking ? 'Waiting for Google...' : 'Continue with Google'}
            </Text>
          </PressableScale>

          <Text
            variant="caption"
            className="mt-3 text-center text-muted-foreground"
          >
            Google signs you in and keeps the account recoverable - you will
            still need a wallet for tickets and check-in.
          </Text>
        </View>
      )}
    </Animated.View>
  );
});
