/**
 * Home header - greeting, wallet chip and the notification bell.
 *
 * Signed out it shows a "Connect" pill; connected it shows the truncated
 * address and SOL balance, which is the fastest way to reassure someone the
 * right wallet is active.
 */

import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Bell, Wallet } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useGreeting } from '@/hooks/use-greeting';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useWalletStore } from '@/store/wallet-store';
import { brand } from '@/theme/colors';
import { TOUCH_TARGET, radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { formatSol, shortenAddress } from '@/utils/format';

export const HomeHeader = memo(function HomeHeader({
  onConnect,
  onOpenNotifications,
  onOpenProfile,
}: {
  onConnect: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
}) {
  const greeting = useGreeting();
  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const balanceSol = useWalletStore((s) => s.balanceSol);
  const { data: unread = 0 } = useUnreadNotificationCount();

  const connected = Boolean(account);

  return (
    <Animated.View
      entering={FadeInDown.duration(420)}
      className="flex-row items-center gap-3"
      style={{ paddingHorizontal: screenPadding, paddingTop: 8 }}
    >
      {connected ? (
        <PressableScale
          onPress={onOpenProfile}
          scaleTo={0.94}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
        >
          <Avatar
            name={user?.name ?? 'You'}
            seed={user?.id ?? 'guest'}
            size="md"
            ring
            uri={user?.avatarUrl}
          />
        </PressableScale>
      ) : (
        <View
          className="items-center justify-center border border-white/10 bg-white/[0.06]"
          style={{ width: 44, height: 44, borderRadius: 22 }}
        >
          <Wallet size={19} color="#94a2b8" strokeWidth={2} />
        </View>
      )}

      <View className="flex-1">
        <Text variant="caption" className="text-muted-foreground">
          {greeting}
        </Text>
        {connected ? (
          <View className="flex-row items-center gap-2">
            <Text variant="title" numberOfLines={1} className="flex-shrink">
              {user?.name ?? 'Wallet'}
            </Text>
            {balanceSol !== null && (
              <Text
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 11,
                  color: brand.green,
                }}
              >
                {formatSol(balanceSol)}
              </Text>
            )}
          </View>
        ) : (
          <Text variant="title">Welcome to Eventerz</Text>
        )}
      </View>

      {/*
        No Friends or Messages icons here any more.

        They used to sit in this row *and* be a tab, and once Community became a
        tab covering friends, requests and messages together, these were a
        second route to a screen already one tap away - the exact redundancy
        this pass exists to remove. The pending-request count is not lost: it
        rides on the Community tab itself, where somebody looking for it will
        be looking.

        Notifications keeps its bell, because notifications are the one thing
        here that is genuinely not a destination in the bar.
      */}

      {connected ? (
        <PressableScale
          onPress={onOpenNotifications}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0
              ? `Notifications, ${unread} unread`
              : 'Notifications'
          }
          className="items-center justify-center border border-white/10 bg-white/[0.06]"
          style={{ width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: radius.full }}
        >
          <Bell size={18} color="#f8fafc" strokeWidth={2} />
          {unread > 0 && (
            <View
              className="absolute items-center justify-center border-2 border-brand-bg"
              style={{
                top: 6,
                right: 6,
                minWidth: 17,
                height: 17,
                borderRadius: 9,
                paddingHorizontal: 3,
                backgroundColor: brand.purple,
              }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.bold,
                  fontSize: 9,
                  color: '#ffffff',
                }}
              >
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          )}
        </PressableScale>
      ) : (
        <PressableScale
          onPress={onConnect}
          scaleTo={0.95}
          accessibilityRole="button"
          accessibilityLabel="Connect wallet"
          className="flex-row items-center gap-1.5 border border-brand-purple/40 bg-brand-purple/15 px-3.5"
          style={{ height: TOUCH_TARGET, borderRadius: radius.full }}
        >
          <Wallet size={15} color={brand.purple} strokeWidth={2.3} />
          <Text
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 13,
              color: brand.purple,
            }}
          >
            Connect
          </Text>
        </PressableScale>
      )}
    </Animated.View>
  );
});

/** Address strip shown under the greeting once a wallet is connected. */
export const WalletStrip = memo(function WalletStrip() {
  const account = useWalletStore((s) => s.account);
  if (!account) return null;

  return (
    <View
      className="flex-row items-center gap-2 self-start border border-white/10 bg-white/[0.04] px-3 py-1.5"
      style={{
        marginHorizontal: screenPadding,
        marginTop: 12,
        borderRadius: radius.full,
      }}
      accessible
      accessibilityLabel={`Connected wallet ${account.address}`}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: brand.green,
        }}
      />
      <Text
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 11,
          color: '#94a2b8',
        }}
      >
        {shortenAddress(account.address, 5)}
      </Text>
      <Text variant="micro" className="text-muted-foreground">
        · {account.cluster}
      </Text>
    </View>
  );
});
