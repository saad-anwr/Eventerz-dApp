/**
 * Signed-out call to action.
 *
 * Shown in place of wallet-dependent content (Tickets, Profile) instead of an
 * empty list, so the signed-out state still explains the product rather than
 * looking broken.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { ShieldCheck, Ticket, Trophy, Wallet } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { brand, gradients } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';

const BENEFITS = [
  { icon: Ticket, label: 'NFT tickets land in your wallet' },
  { icon: Trophy, label: 'Attendance builds portable reputation' },
  { icon: ShieldCheck, label: 'You approve every transaction' },
] as const;

export const ConnectWalletPrompt = memo(function ConnectWalletPrompt({
  title = 'Connect your wallet',
  description = 'Your wallet is your Eventerz identity — no email, no password, no bots.',
  onConnect,
}: {
  title?: string;
  description?: string;
  onConnect: () => void;
}) {
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
    </Animated.View>
  );
});
