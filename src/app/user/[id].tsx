/**
 * Public user profile - the read-only view of someone else's on-chain record.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/cards/event-card';
import { StatsCard } from '@/components/cards/stats-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import {
  ArrowLeft,
  CalendarCheck,
  MapPin,
  Ticket,
  Trophy,
} from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useEventsByAttendee, useEventsByHost } from '@/hooks/use-events';
import { useUser } from '@/hooks/use-users';
import { gradients } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { EventItem } from '@/types';
import { shortenAddress } from '@/utils/format';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: user, isLoading, isError, refetch } = useUser(id);
  const hosted = useEventsByHost(id);
  const attended = useEventsByAttendee(id);

  const openEvent = useCallback(
    (event: EventItem) => router.push(`/event/${event.id}`),
    [router],
  );

  if (isLoading) return <ScreenLoader label="Loading profile" />;

  if (isError || !user) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ErrorState title="Profile not found" onRetry={() => refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edgeTop={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Banner */}
        <View style={{ height: 120 }}>
          <LinearGradient
            colors={[...gradients.brandSoft.colors]}
            locations={[...gradients.brandSoft.locations]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: screenPadding,
            }}
          >
            <IconButton
              icon={ArrowLeft}
              label="Go back"
              onPress={() => router.back()}
              variant="glass"
              size={40}
              iconSize={18}
            />
          </View>
        </View>

        {/* Identity */}
        <View style={{ paddingHorizontal: screenPadding, marginTop: -38 }}>
          <View
            style={{ borderRadius: 42, borderWidth: 3, borderColor: '#050816' }}
            className="self-start"
          >
            <Avatar name={user.name} seed={user.id} size={76} />
          </View>

          <Text variant="h2" className="mt-3.5" numberOfLines={1}>
            {user.name}
          </Text>
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
            <Badge
              label={`${user.reputation} reputation`}
              variant="cyan"
              size="sm"
              icon={Trophy}
            />
          </View>

          {user.walletAddress && (
            <View
              className="mt-4 flex-row items-center gap-2 self-start border border-white/10 bg-white/[0.04] px-3 py-2"
              style={{ borderRadius: radius.full }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 11,
                  color: '#94a2b8',
                }}
              >
                {shortenAddress(user.walletAddress, 6)}
              </Text>
            </View>
          )}

          {user.interests.length > 0 && (
            <View className="mt-4 flex-row flex-wrap gap-2">
              {user.interests.map((interest) => (
                <Badge key={interest} label={interest} size="sm" />
              ))}
            </View>
          )}
        </View>

        {/* Stats */}
        <View
          className="mt-6 flex-row gap-3"
          style={{ paddingHorizontal: screenPadding }}
        >
          <StatsCard
            label="Organized"
            value={hosted.data?.length ?? 0}
            icon={Ticket}
            accent="purple"
            className="flex-1"
          />
          <StatsCard
            label="Attended"
            value={attended.data?.length ?? 0}
            icon={CalendarCheck}
            accent="cyan"
            className="flex-1"
          />
          <StatsCard
            label="Reputation"
            value={user.reputation}
            icon={Trophy}
            accent="green"
            className="flex-1"
          />
        </View>

        {/* Hosted events */}
        <View
          className="mt-8 gap-4"
          style={{ paddingHorizontal: screenPadding }}
        >
          <Text variant="h3" accessibilityRole="header">
            Hosting
          </Text>

          {(hosted.data ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="Not hosting anything"
              description={`${user.name} has no published events right now.`}
            />
          ) : (
            (hosted.data ?? []).map((event, index) => (
              <Animated.View
                key={event.id}
                entering={FadeInDown.delay(index * 60).duration(360)}
              >
                <EventCard event={event} onPress={openEvent} />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
