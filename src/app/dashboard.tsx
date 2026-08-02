/**
 * Organizer dashboard.
 *
 * The mobile read of the web app's organizer section: headline stats with
 * animated counters, a mint-trend area chart, per-event attendance bars and a
 * live registration feed.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Dimensions, RefreshControl, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { StatsCard } from '@/components/cards/stats-card';
import { AnimatedHeader } from '@/components/layout/animated-header';
import { SectionHeader } from '@/components/layout/section-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BadgeCheck,
  CalendarCheck,
  Plus,
  Ticket,
  TrendingUp,
  Trophy,
  Users,
} from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { AreaChart, BarChart } from '@/features/dashboard/charts';
import { ConnectWalletPrompt, ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import { queryKeys } from '@/hooks/query-keys';
import {
  useAttendanceSeries,
  useMintsSeries,
  useOrganizerStats,
  useRecentRegistrations,
} from '@/hooks/use-analytics-data';
import { useEventsByHost } from '@/hooks/use-events';
import { useRefresh } from '@/hooks/use-refresh';
import { useUsers } from '@/hooks/use-users';
import { useWalletStore } from '@/store/wallet-store';
import { brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { shortenAddress, timeAgo } from '@/utils/format';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - screenPadding * 2 - 32;

export default function DashboardScreen() {
  const router = useRouter();
  const scrollY = useSharedValue(0);

  const { isConnected, sheetVisible, openSheet, closeSheet, handleConnected } =
    useConnectWallet();

  const user = useWalletStore((s) => s.user);
  const stats = useOrganizerStats();
  const mints = useMintsSeries();
  const attendance = useAttendanceSeries();
  const registrations = useRecentRegistrations(6);
  const hosted = useEventsByHost(user?.id);

  const { refreshing, onRefresh } = useRefresh([queryKeys.analytics.all]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const registrantIds = (registrations.data ?? []).map((r) => r.userId);
  const { data: registrants = [] } = useUsers(registrantIds);

  const findUser = useCallback(
    (id: string) => registrants.find((u) => u.id === id),
    [registrants],
  );

  if (!isConnected) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ConnectWalletPrompt
            title="Organizer dashboard"
            description="Connect the wallet you host with to see mints, revenue and check-ins."
            onConnect={openSheet}
          />
        </View>
        <ConnectWalletSheet
          visible={sheetVisible}
          onClose={closeSheet}
          onConnected={handleConnected}
        />
      </Screen>
    );
  }

  return (
    <Screen edgeTop={false}>
      <AnimatedHeader
        title="Dashboard"
        scrollY={scrollY}
        threshold={70}
        onBack={() => router.back()}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: 108, paddingBottom: 48 }}
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
        <View style={{ paddingHorizontal: screenPadding }}>
          <Text variant="h1" accessibilityRole="header">
            Dashboard
          </Text>
          <Text variant="bodySm" className="mt-1 text-muted-foreground">
            Everything you have shipped as an organizer
          </Text>
        </View>

        {/* Stats grid */}
        {stats.isLoading ? (
          <View
            className="mt-6 flex-row flex-wrap gap-3"
            style={{ paddingHorizontal: screenPadding }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                width="47%"
                height={116}
                radius={20}
                style={{ flexGrow: 1 }}
              />
            ))}
          </View>
        ) : (
          <View
            className="mt-6 flex-row flex-wrap gap-3"
            style={{ paddingHorizontal: screenPadding }}
          >
            <StatsCard
              label="Events created"
              value={stats.data?.eventsCreated ?? 0}
              delta={stats.data?.deltas.eventsCreated}
              icon={CalendarCheck}
              accent="purple"
              style={{ width: '47%', flexGrow: 1 }}
            />
            <StatsCard
              label="Tickets minted"
              value={stats.data?.ticketsMinted ?? 0}
              delta={stats.data?.deltas.ticketsMinted}
              icon={Ticket}
              accent="blue"
              compact
              style={{ width: '47%', flexGrow: 1 }}
            />
            <StatsCard
              label="Revenue"
              value={stats.data?.revenueSol ?? 0}
              delta={stats.data?.deltas.revenueSol}
              prefix="◎ "
              decimals={1}
              icon={Trophy}
              accent="green"
              style={{ width: '47%', flexGrow: 1 }}
            />
            <StatsCard
              label="Attendance rate"
              value={stats.data?.attendanceRate ?? 0}
              delta={stats.data?.deltas.attendanceRate}
              suffix="%"
              icon={BadgeCheck}
              accent="cyan"
              style={{ width: '47%', flexGrow: 1 }}
            />
          </View>
        )}

        {/* Mints trend */}
        <View className="mt-9">
          <SectionHeader
            title="Tickets minted"
            subtitle="Last nine months"
            icon={TrendingUp}
          />
          <View
            className="mt-4 border border-white/10 bg-white/[0.03] p-4"
            style={{
              marginHorizontal: screenPadding,
              borderRadius: radius['2xl'],
            }}
          >
            {mints.isLoading ? (
              <Skeleton height={150} radius={12} />
            ) : (
              <AreaChart data={mints.data ?? []} width={CHART_WIDTH} />
            )}
          </View>
        </View>

        {/* Attendance */}
        <View className="mt-9">
          <SectionHeader
            title="Check-in rate"
            subtitle="Share of ticket holders who showed up"
            icon={BadgeCheck}
          />
          <View
            className="mt-4 border border-white/10 bg-white/[0.03] p-4"
            style={{
              marginHorizontal: screenPadding,
              borderRadius: radius['2xl'],
            }}
          >
            {attendance.isLoading ? (
              <Skeleton height={140} radius={12} />
            ) : (
              <BarChart data={attendance.data ?? []} />
            )}
          </View>
        </View>

        {/* Recent registrations */}
        <View className="mt-9">
          <SectionHeader
            title="Recent registrations"
            subtitle="Wallets that RSVP'd to your events"
            icon={Users}
          />
          <View
            className="mt-4 border border-white/10 bg-white/[0.03] px-4"
            style={{
              marginHorizontal: screenPadding,
              borderRadius: radius['2xl'],
            }}
          >
            {registrations.isLoading ? (
              <View className="py-4 gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={44} radius={12} />
                ))}
              </View>
            ) : (registrations.data ?? []).length === 0 ? (
              <EmptyState
                icon={Users}
                title="No registrations yet"
                description="They appear here the moment someone RSVPs."
              />
            ) : (
              (registrations.data ?? []).map((registration, index) => {
                const registrant = findUser(registration.userId);
                return (
                  <Animated.View
                    key={registration.id}
                    entering={FadeInDown.delay(index * 55).duration(360)}
                  >
                    <View className="flex-row items-center gap-3 py-3">
                      <Avatar
                        name={registrant?.name ?? 'Guest'}
                        seed={registration.userId}
                        size="sm"
                      />
                      <View className="flex-1">
                        <Text variant="bodySm" numberOfLines={1}>
                          {registrant?.name ?? 'Unknown wallet'}
                        </Text>
                        <Text
                          style={{
                            fontFamily: fontFamily.mono,
                            fontSize: 11,
                            color: '#64748b',
                            marginTop: 2,
                          }}
                        >
                          {shortenAddress(registration.walletAddress, 5)}
                        </Text>
                      </View>
                      <View className="items-end gap-1">
                        <Badge
                          label={registration.status}
                          variant={
                            registration.status === 'confirmed'
                              ? 'green'
                              : registration.status === 'pending'
                                ? 'warning'
                                : 'default'
                          }
                          size="sm"
                        />
                        <Text variant="micro" className="text-muted-foreground">
                          {timeAgo(registration.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {index < (registrations.data ?? []).length - 1 && (
                      <View className="h-px bg-white/[0.06]" />
                    )}
                  </Animated.View>
                );
              })
            )}
          </View>
        </View>

        {/* Your events */}
        <View className="mt-9" style={{ paddingHorizontal: screenPadding }}>
          <Button
            label="Create another event"
            icon={Plus}
            onPress={() => router.push('/(tabs)/create')}
            fullWidth
            size="lg"
          />
          {(hosted.data ?? []).length > 0 && (
            <Text
              variant="caption"
              className="mt-3 text-center text-muted-foreground"
            >
              You are hosting {(hosted.data ?? []).length} event
              {(hosted.data ?? []).length === 1 ? '' : 's'} right now.
            </Text>
          )}
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}
