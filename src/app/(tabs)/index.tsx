/**
 * Home.
 *
 * A single scroll view of rails: featured carousel, quick actions, trending
 * communities, upcoming and recommended events. Each rail owns its own query
 * so a slow one never blocks the rest of the page from painting.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CommunityCard } from '@/components/cards/community-card';
import { EventCard } from '@/components/cards/event-card';
import { SectionHeader } from '@/components/layout/section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarCheck, Compass, Sparkles, TrendingUp } from '@/components/ui/icon';
import { Screen, useListBottomPadding } from '@/components/ui/screen';
import { EventCardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { FeaturedCarousel } from '@/features/home/featured-carousel';
import { HomeHeader, WalletStrip } from '@/features/home/home-header';
import { QuickActions } from '@/features/home/quick-actions';
import { ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import { useTrendingCommunities } from '@/hooks/use-communities';
import {
  useFeaturedEvents,
  useRecommendedEvents,
  useUpcomingEvents,
} from '@/hooks/use-events';
import { queryKeys } from '@/hooks/query-keys';
import { useRefresh } from '@/hooks/use-refresh';
import { brand } from '@/theme/colors';
import { screenPadding } from '@/theme/layout';
import type { Community, EventItem } from '@/types';

const REFRESH_KEYS = [
  queryKeys.events.all,
  queryKeys.communities.all,
  queryKeys.notifications.all,
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const bottomPadding = useListBottomPadding();

  const {
    sheetVisible,
    requireWallet,
    openSheet,
    closeSheet,
    handleConnected,
  } = useConnectWallet();

  const featured = useFeaturedEvents();
  const upcoming = useUpcomingEvents(5);
  const recommended = useRecommendedEvents(5);
  const communities = useTrendingCommunities(5);

  const { refreshing, onRefresh } = useRefresh(REFRESH_KEYS);

  const openEvent = useCallback(
    (event: EventItem) => router.push(`/event/${event.id}`),
    [router],
  );

  const openCommunity = useCallback(
    (community: Community) => router.push(`/community/${community.id}`),
    [router],
  );

  const handleQuickAction = useCallback(
    (id: string) => {
      switch (id) {
        case 'create':
          requireWallet(() => router.push('/(tabs)/create'));
          break;
        case 'scan':
          requireWallet(() => router.push('/scan'));
          break;
        case 'tickets':
          requireWallet(() => router.push('/(tabs)/tickets'));
          break;
        case 'wallet':
          requireWallet(() => router.push('/(tabs)/profile'));
          break;
      }
    },
    [requireWallet, router],
  );

  return (
    <Screen tabBarInset={false}>
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
        <HomeHeader
          onConnect={openSheet}
          onOpenNotifications={() => router.push('/notifications')}
          onOpenProfile={() => router.push('/(tabs)/profile')}
        />
        <WalletStrip />

        <View className="mt-5">
          <QuickActions onAction={handleQuickAction} />
        </View>

        {/* Featured */}
        <View className="mt-8">
          <SectionHeader
            title="Featured"
            subtitle="Hand-picked by the Eventerz team"
            icon={Sparkles}
            onAction={() => router.push('/(tabs)/discover')}
          />
          <View className="mt-4">
            <FeaturedCarousel
              events={featured.data ?? []}
              loading={featured.isLoading}
              onSelect={openEvent}
            />
          </View>
        </View>

        {/* Trending communities */}
        <View className="mt-9">
          <SectionHeader
            title="Trending communities"
            subtitle="Where builders are showing up this month"
            icon={TrendingUp}
          />
          {communities.isLoading ? (
            <View
              className="mt-4 flex-row gap-3"
              style={{ paddingHorizontal: screenPadding }}
            >
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={152} height={132} radius={20} />
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
              accessibilityLabel="Trending communities"
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
          )}
        </View>

        {/* Upcoming */}
        <View className="mt-9">
          <SectionHeader
            title="Upcoming"
            subtitle="Starting soon across every community"
            icon={CalendarCheck}
            onAction={() => router.push('/(tabs)/discover')}
          />
          <View
            className="mt-4 gap-4"
            style={{ paddingHorizontal: screenPadding }}
          >
            {upcoming.isLoading ? (
              <>
                <EventCardSkeleton />
                <EventCardSkeleton />
              </>
            ) : (upcoming.data ?? []).length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Nothing on the calendar"
                description="New events appear here as organizers publish them."
              />
            ) : (
              (upcoming.data ?? []).map((event, index) => (
                <Animated.View
                  key={event.id}
                  entering={FadeInDown.delay(index * 60).duration(380)}
                >
                  <EventCard event={event} onPress={openEvent} />
                </Animated.View>
              ))
            )}
          </View>
        </View>

        {/* Recommended */}
        <View className="mt-9">
          <SectionHeader
            title="Recommended for you"
            subtitle="Matched to your interests and past attendance"
            icon={Compass}
          />
          {recommended.isLoading ? (
            <View
              className="mt-4 flex-row gap-3.5"
              style={{ paddingHorizontal: screenPadding }}
            >
              <Skeleton width={260} height={250} radius={24} />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{
                paddingHorizontal: screenPadding,
                gap: 14,
              }}
              accessibilityRole="list"
              accessibilityLabel="Recommended events"
            >
              {(recommended.data ?? []).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={openEvent}
                  width={260}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <ConnectWalletSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onConnected={handleConnected}
      />
    </Screen>
  );
}
