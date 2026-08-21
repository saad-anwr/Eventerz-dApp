/**
 * Profile.
 *
 * Wallet identity, reputation, badges, communities and the events the user
 * organized or attended - the mobile read of the on-chain record the web app
 * describes.
 */

import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CommunityCard } from '@/components/cards/community-card';
import { EventCard } from '@/components/cards/event-card';
import { StatsCard } from '@/components/cards/stats-card';
import { SectionHeader } from '@/components/layout/section-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BadgeCheck,
  CalendarCheck,
  Copy,
  LayoutDashboard,
  MapPin,
  Pencil,
  Ticket,
  Trophy,
  Wallet,
  DynamicIcon,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, useListBottomPadding } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  ConnectWalletPrompt,
  ConnectWalletSheet,
  GoogleMark,
  useConnectWallet,
} from '@/features/wallet';
import { useSeekerStatus } from '@/hooks/use-seeker';
import { HoldingsList } from '@/features/wallet/holdings-list';
import { queryKeys } from '@/hooks/query-keys';
import { useMyCommunities } from '@/hooks/use-communities';
import { useEventsByAttendee, useEventsByHost } from '@/hooks/use-events';
import { useRefresh } from '@/hooks/use-refresh';
import { useMyBadges } from '@/hooks/use-tickets';
import { selectGoogleEmail, useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand, gradients } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Community, EventItem } from '@/types';
import { compactNumber, formatSol, shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';

/** Reputation tiers - mirrors the web app's community reputation copy. */
const TIERS = [
  { min: 0, label: 'Newcomer', next: 250 },
  { min: 250, label: 'Regular', next: 500 },
  { min: 500, label: 'Contributor', next: 1000 },
  { min: 1000, label: 'Core', next: 2000 },
  { min: 2000, label: 'Legend', next: Infinity },
] as const;

function tierFor(reputation: number) {
  return [...TIERS].reverse().find((t) => reputation >= t.min) ?? TIERS[0];
}

type TabValue = 'attending' | 'organized';

export default function ProfileScreen() {
  const router = useRouter();
  const bottomPadding = useListBottomPadding();
  const [tab, setTab] = useState<TabValue>('attending');

  const { sheetVisible, openSheet, closeSheet, handleConnected } =
    useConnectWallet();

  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const balanceSol = useWalletStore((s) => s.balanceSol);
  const googleEmail = useAuthStore(selectGoogleEmail);

  /*
   * Seeker ownership, from the Genesis Token the device minted into its Seed
   * Vault. Keyed on the wallet rather than the profile, since it is a fact
   * about the wallet.
   */
  const seeker = useSeekerStatus(account?.address);

  const badges = useMyBadges();
  const communities = useMyCommunities();
  const attending = useEventsByAttendee(user?.id);
  const organized = useEventsByHost(user?.id);

  const { refreshing, onRefresh } = useRefresh([
    queryKeys.events.all,
    queryKeys.tickets.all,
    queryKeys.communities.all,
  ]);

  const copyAddress = useCallback(async () => {
    if (!account) return;
    haptics.success();
    await Clipboard.setStringAsync(account.address);
    toast.success('Address copied', shortenAddress(account.address, 6));
  }, [account]);

  const openEvent = useCallback(
    (event: EventItem) => router.push(`/event/${event.id}`),
    [router],
  );

  const openCommunity = useCallback(
    (community: Community) => router.push(`/communities/${community.id}`),
    [router],
  );

  /*
   * Gated on having an identity, not on having a wallet.
   *
   * It used to require `isConnected && account` as well, so signing in with
   * Google left this screen still offering "Connect wallet" while the app was
   * demonstrably signed in - the home banner said "Welcome, <email>" at the
   * same moment. A Google account is a real profile row; it earns the profile
   * screen. Everything genuinely wallet-shaped below (address, balance, Seeker
   * status, holdings) is guarded on `account` individually.
   */
  if (!user) {
    return (
      <Screen tabBarInset padded>
        {/*
          The settings shortcut that used to sit here is gone: Settings is its
          own tab, visible at the bottom of this very screen, signed in or out.
          It still must not require a wallet - it holds account recovery and
          privacy controls - and as a tab it never did.
        */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        >
          <ConnectWalletPrompt
            title="Your on-chain profile"
            description="Connect a wallet to see your reputation, badges and the events you've shown up for."
            onConnect={openSheet}
          />
        </ScrollView>

        <ConnectWalletSheet
          visible={sheetVisible}
          onClose={closeSheet}
          onConnected={handleConnected}
        />
      </Screen>
    );
  }

  const tier = tierFor(user.reputation);
  const tierProgress =
    tier.next === Infinity
      ? 100
      : ((user.reputation - tier.min) / (tier.next - tier.min)) * 100;

  const visibleEvents =
    tab === 'attending' ? (attending.data ?? []) : (organized.data ?? []);
  const eventsLoading =
    tab === 'attending' ? attending.isLoading : organized.isLoading;

  return (
    <Screen edgeTop={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.purple}
            colors={[brand.purple, brand.cyan]}
            progressBackgroundColor="#0b1024"
          />
        }
      >
        {/* Banner */}
        <View style={{ height: 132 }}>
          <LinearGradient
            colors={[...gradients.brandSoft.colors]}
            locations={[...gradients.brandSoft.locations]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            className="absolute right-4 flex-row gap-2"
            style={{ top: 52 }}
          >
            <IconButton
              icon={LayoutDashboard}
              label="Organizer dashboard"
              onPress={() => router.push('/dashboard')}
              variant="glass"
              size={40}
              iconSize={18}
            />
            {/*
              No Friends or Settings buttons.

              Both are tabs now, permanently on screen at the bottom. A shortcut
              to a destination the user can already see is the redundancy this
              pass removed everywhere else - and here it was worse than
              harmless, because Settings had *two* entry points on this one
              screen.
            */}
          </View>
        </View>

        {/* Identity */}
        <View style={{ paddingHorizontal: screenPadding, marginTop: -42 }}>
          <View className="flex-row items-end justify-between">
            <View
              style={{
                borderRadius: 46,
                borderWidth: 3,
                borderColor: '#050816',
              }}
            >
              <Avatar
                name={user.name}
                seed={user.id}
                size={84}
                uri={user.avatarUrl}
              />
            </View>
            <Button
              label="Edit"
              icon={Pencil}
              variant="secondary"
              size="sm"
              onPress={() => router.push('/profile/edit')}
              className="mb-1"
            />
          </View>

          <View className="mt-3.5 flex-row items-center gap-2">
            <Text variant="h2" numberOfLines={1} className="flex-shrink">
              {user.name}
            </Text>
            <BadgeCheck size={17} color={brand.cyan} strokeWidth={2.4} />
          </View>

          <Text variant="bodySm" className="mt-0.5 text-muted-foreground">
            @{user.handle}
          </Text>

          {user.bio && (
            <Text variant="bodySm" className="mt-2.5">
              {user.bio}
            </Text>
          )}

          <View className="mt-3 flex-row flex-wrap items-center gap-3">
            {user.location && (
              <View className="flex-row items-center gap-1">
                <MapPin size={12} color="#94a2b8" strokeWidth={2} />
                <Text variant="caption" className="text-muted-foreground">
                  {user.location}
                </Text>
              </View>
            )}
            <Badge label={tier.label} variant="purple" size="sm" icon={Trophy} />
            {/* Google is a recovery credential, not the identity - so it reads
                as a small "recoverable" marker rather than a sign-in badge. */}
            {googleEmail && (
              <View
                className="flex-row items-center gap-1.5 border border-white/10 bg-white/[0.04] px-2 py-1"
                style={{ borderRadius: radius.full }}
                accessible
                accessibilityLabel={`Recoverable via Google, ${googleEmail}`}
              >
                <GoogleMark size={11} />
                <Text variant="micro" className="text-muted-foreground">
                  Recoverable
                </Text>
              </View>
            )}
          </View>

          {/*
            Wallet chip, or an invitation to connect one.

            A Google account gets this screen without a wallet, so this is the
            one place that has to hold both states: the address when there is
            one, and the way to get one when there is not. Tickets and check-in
            still need a wallet, and saying so here is better than a profile
            that quietly omits the row.
          */}
          {!account && (
            <PressableScale
              onPress={openSheet}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Connect a wallet"
              className="mt-4 flex-row items-center gap-2.5 border border-white/10 bg-white/[0.04] px-3.5 py-3"
              style={{ borderRadius: radius.xl }}
            >
              <Wallet size={14} color={brand.purple} strokeWidth={2.2} />
              <View className="flex-1">
                <Text variant="bodySm">Connect a wallet</Text>
                <Text variant="micro" className="text-muted-foreground">
                  Needed for tickets and check-in
                </Text>
              </View>
              <Text variant="micro" style={{ color: brand.purple }}>
                Connect
              </Text>
            </PressableScale>
          )}

          {account && (
          <PressableScale
            onPress={copyAddress}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`Copy wallet address ${account.address}`}
            className="mt-4 flex-row items-center gap-2.5 border border-white/10 bg-white/[0.04] px-3.5 py-3"
            style={{ borderRadius: radius.xl }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: brand.green,
              }}
            />
            <Text
              className="flex-1"
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 12,
                color: '#cbd5e1',
              }}
              numberOfLines={1}
            >
              {shortenAddress(account.address, 8)}
            </Text>
            {balanceSol !== null && (
              <Text
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 12,
                  color: brand.green,
                }}
              >
                {formatSol(balanceSol)}
              </Text>
            )}
            <Copy size={14} color="#94a2b8" strokeWidth={2.2} />
          </PressableScale>
          )}

          {/*
            Seeker ownership.

            Only rendered once it resolves to something. A row that says
            "checking..." on every profile open, and "not a Seeker" for the
            majority of users on other Android phones, is noise on a screen that
            is about them rather than their hardware.
          */}
          {seeker.verified && (
            <View
              className="mt-2.5 flex-row items-center gap-2 self-start border border-white/10 px-3 py-2"
              style={{
                borderRadius: radius.full,
                backgroundColor: `${brand.green}14`,
              }}
            >
              <BadgeCheck size={13} color={brand.green} strokeWidth={2.4} />
              <Text variant="caption" style={{ color: brand.green }}>
                Seeker verified
              </Text>
            </View>
          )}
        </View>

        {/*
          Token holdings.

          The row above shows SOL only, which made a wallet holding several SPL
          tokens look empty - `getWalletAssets` was a stub that never asked for
          them.
        */}
        {account && (
          <View className="mt-3" style={{ paddingHorizontal: screenPadding }}>
            <HoldingsList address={account.address} />
          </View>
        )}

        {/* Reputation */}
        <View className="mt-6" style={{ paddingHorizontal: screenPadding }}>
          <View
            className="border border-white/10 bg-white/[0.035] p-4"
            style={{ borderRadius: radius['2xl'] }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Trophy size={15} color={brand.cyan} strokeWidth={2.2} />
                <Text variant="title">Reputation</Text>
              </View>
              <Text
                style={{
                  fontFamily: fontFamily.displayBold,
                  fontSize: 20,
                  color: brand.cyan,
                }}
              >
                {user.reputation}
              </Text>
            </View>

            <ProgressBar
              percent={tierProgress}
              className="mt-3"
              label={`${user.reputation} reputation, ${tier.label} tier`}
            />

            <Text variant="caption" className="mt-2 text-muted-foreground">
              {tier.next === Infinity
                ? 'Top tier reached - nothing left to climb.'
                : `${tier.next - user.reputation} more to reach ${
                    TIERS[TIERS.findIndex((t) => t.min === tier.min) + 1]?.label
                  }`}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View
          className="mt-4 flex-row gap-3"
          style={{ paddingHorizontal: screenPadding }}
        >
          <StatsCard
            label="Attended"
            value={attending.data?.length ?? 0}
            icon={CalendarCheck}
            accent="cyan"
            className="flex-1"
          />
          <StatsCard
            label="Organized"
            value={organized.data?.length ?? 0}
            icon={Ticket}
            accent="purple"
            className="flex-1"
          />
          <StatsCard
            label="Badges"
            value={badges.data?.length ?? 0}
            icon={Trophy}
            accent="green"
            className="flex-1"
          />
        </View>

        {/* Badges */}
        <View className="mt-8">
          <SectionHeader
            title="Attendance badges"
            subtitle="Proof of attendance you have earned"
            icon={BadgeCheck}
            onAction={() => router.push('/tickets')}
          />
          {badges.isLoading ? (
            <View
              className="mt-4 flex-row gap-3"
              style={{ paddingHorizontal: screenPadding }}
            >
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={104} height={104} radius={16} />
              ))}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{
                paddingHorizontal: screenPadding,
                gap: 12,
              }}
              accessibilityRole="list"
              accessibilityLabel="Attendance badges"
            >
              {(badges.data ?? []).map((badge) => {
                const color = accents[badge.accent];
                return (
                  <View
                    key={badge.id}
                    className="items-center justify-center border border-white/10 bg-white/[0.035] p-3"
                    style={{ width: 104, height: 104, borderRadius: radius.xl }}
                    accessible
                    accessibilityLabel={badge.name}
                  >
                    <DynamicIcon
                      name={badge.icon}
                      size={26}
                      color={color}
                      strokeWidth={1.9}
                    />
                    <Text
                      variant="micro"
                      className="mt-2 text-center"
                      numberOfLines={2}
                    >
                      {badge.name}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Communities */}
        {(communities.data ?? []).length > 0 && (
          <View className="mt-8">
            <SectionHeader
              title="Communities"
              subtitle={`Member of ${compactNumber((communities.data ?? []).length)}`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{
                paddingHorizontal: screenPadding,
                gap: 12,
              }}
            >
              {(communities.data ?? []).map((community) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  onPress={openCommunity}
                  compact
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Events */}
        <View className="mt-8" style={{ paddingHorizontal: screenPadding }}>
          <SegmentedControl
            options={[
              {
                value: 'attending',
                label: 'Attending',
                count: attending.data?.length ?? 0,
              },
              {
                value: 'organized',
                label: 'Organized',
                count: organized.data?.length ?? 0,
              },
            ]}
            value={tab}
            onChange={setTab}
          />

          <View className="mt-4 gap-4">
            {eventsLoading ? (
              <Skeleton height={230} radius={24} />
            ) : visibleEvents.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title={
                  tab === 'attending'
                    ? 'No events yet'
                    : 'You have not hosted yet'
                }
                description={
                  tab === 'attending'
                    ? 'RSVP to something and it shows up here.'
                    : 'Publishing your first event takes about two minutes.'
                }
                actionLabel={tab === 'attending' ? 'Discover' : 'Create event'}
                onAction={() =>
                  router.push(
                    tab === 'attending' ? '/explore' : '/(tabs)/create',
                  )
                }
              />
            ) : (
              visibleEvents.map((event, index) => (
                <Animated.View
                  key={event.id}
                  entering={FadeInDown.delay(index * 60).duration(360)}
                >
                  <EventCard event={event} onPress={openEvent} />
                </Animated.View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
