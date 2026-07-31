/**
 * Community detail - description, membership, stats and the community's events.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/cards/event-card';
import { StatsCard } from '@/components/cards/stats-card';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck,
  Check,
  Lock,
  Plus,
  Users,
  DynamicIcon,
} from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import {
  useCommunity,
  useToggleCommunityMembership,
} from '@/hooks/use-communities';
import { useEventsByCommunity } from '@/hooks/use-events';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, resolveCoverGradient } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import type { EventItem } from '@/types';
import { compactNumber } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { sheetVisible, requireWallet, closeSheet, handleConnected } =
    useConnectWallet();

  const { data: community, isLoading, isError, refetch } = useCommunity(id);
  const events = useEventsByCommunity(id);
  const user = useWalletStore((s) => s.user);
  const toggleMembership = useToggleCommunityMembership();

  const openEvent = useCallback(
    (event: EventItem) => router.push(`/event/${event.id}`),
    [router],
  );

  const handleJoin = useCallback(() => {
    if (!community) return;
    requireWallet(() => {
      haptics.medium();
      toggleMembership.mutate(community.id, {
        onSuccess: (updated) => {
          const joined = user ? updated.memberIds.includes(user.id) : false;
          haptics.success();
          toast.success(
            joined ? `Joined ${updated.name}` : `Left ${updated.name}`,
            joined
              ? 'You will see their events on Home.'
              : 'You can rejoin any time.',
          );
        },
        onError: () => {
          haptics.error();
          toast.error('Could not update membership');
        },
      });
    });
  }, [community, requireWallet, toggleMembership, user]);

  if (isLoading) return <ScreenLoader label="Loading community" />;

  if (isError || !community) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ErrorState
            title="Community not found"
            onRetry={() => refetch()}
          />
        </View>
      </Screen>
    );
  }

  const accent = accents[community.accent];
  const colors = resolveCoverGradient(community.coverGradient);
  const joined = user ? community.memberIds.includes(user.id) : false;

  return (
    <Screen edgeTop={false} aurora={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Banner */}
        <View style={{ height: 150 }}>
          <LinearGradient
            colors={[colors[0], colors[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0, opacity: 0.9 }}
          />
          <LinearGradient
            colors={['transparent', 'rgba(5,8,22,0.85)']}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            style={{ paddingTop: insets.top + 8, paddingHorizontal: screenPadding }}
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
        <View style={{ paddingHorizontal: screenPadding, marginTop: -34 }}>
          <View
            className="items-center justify-center border-2 border-brand-bg"
            style={{
              width: 70,
              height: 70,
              borderRadius: radius['2xl'],
              backgroundColor: '#0b1024',
            }}
          >
            <DynamicIcon
              name={community.icon}
              size={32}
              color={accent}
              strokeWidth={1.9}
            />
          </View>

          <View className="mt-3.5 flex-row items-center gap-2">
            <Text variant="h1" numberOfLines={1} className="flex-shrink">
              {community.name}
            </Text>
            {community.verified && (
              <BadgeCheck size={19} color={accent} strokeWidth={2.4} />
            )}
          </View>

          <View className="mt-2 flex-row flex-wrap gap-2">
            {community.tokenGated && (
              <Badge label="Token-gated" variant="purple" icon={Lock} size="sm" />
            )}
            <Badge
              label={`${compactNumber(community.memberCount)} members`}
              variant="default"
              size="sm"
            />
          </View>

          <Text variant="body" className="mt-3 text-muted-foreground">
            {community.description}
          </Text>

          <Button
            label={joined ? 'Joined' : 'Join community'}
            icon={joined ? Check : Plus}
            variant={joined ? 'secondary' : 'primary'}
            onPress={handleJoin}
            loading={toggleMembership.isPending}
            fullWidth
            size="lg"
            className="mt-5"
          />
        </View>

        {/* Stats */}
        <View
          className="mt-6 flex-row gap-3"
          style={{ paddingHorizontal: screenPadding }}
        >
          <StatsCard
            label="Members"
            value={community.memberCount}
            icon={Users}
            accent={community.accent}
            compact
            className="flex-1"
          />
          <StatsCard
            label="Events hosted"
            value={community.eventCount}
            icon={CalendarCheck}
            accent="cyan"
            className="flex-1"
          />
        </View>

        {/* Events */}
        <View
          className="mt-8 gap-4"
          style={{ paddingHorizontal: screenPadding }}
        >
          <Text variant="h3" accessibilityRole="header">
            Events
          </Text>

          {events.isLoading ? null : (events.data ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No events scheduled"
              description={`${community.name} has not published anything upcoming.`}
            />
          ) : (
            (events.data ?? []).map((event, index) => (
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

      <ConnectWalletSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onConnected={handleConnected}
      />
    </Screen>
  );
}
