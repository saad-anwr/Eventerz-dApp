/**
 * The four numbers that describe an account, on Home.
 *
 * The website's dashboard has led with Hosting / Attending / Friends /
 * Reputation since it shipped; the app's home screen had no equivalent, so the
 * same person opening the same account on a phone and in a browser was shown
 * two different summaries of themselves. These are the same four, in the same
 * order, with the same accents.
 *
 * Rendered only while connected. Four zeroes are not a summary of anything to
 * somebody who has not signed in yet, and the connect prompt above says the
 * useful thing instead.
 */

import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StatsCard } from '@/components/cards/stats-card';
import { Award, CalendarPlus, Ticket, Users } from '@/components/ui/icon';
import { useEventsByAttendee, useEventsByHost } from '@/hooks/use-events';
import { useFriends } from '@/hooks/use-friends';
import { useWalletStore } from '@/store/wallet-store';
import { screenPadding } from '@/theme/layout';

export const HomeStats = memo(function HomeStats() {
  const user = useWalletStore((s) => s.user);
  const userId = user?.id;

  const hosting = useEventsByHost(userId);
  const attending = useEventsByAttendee(userId);
  const friends = useFriends(userId);

  const tiles = useMemo(
    () =>
      [
        {
          key: 'hosting',
          label: 'Hosting',
          value: hosting.data?.length ?? 0,
          icon: Ticket,
          accent: 'purple' as const,
        },
        {
          key: 'attending',
          label: 'Attending',
          value: attending.data?.length ?? 0,
          icon: CalendarPlus,
          accent: 'blue' as const,
        },
        {
          key: 'friends',
          label: 'Friends',
          value: friends.data?.length ?? 0,
          icon: Users,
          accent: 'cyan' as const,
        },
        {
          key: 'reputation',
          label: 'Reputation',
          value: user?.reputation ?? 0,
          icon: Award,
          accent: 'green' as const,
        },
      ] as const,
    [hosting.data, attending.data, friends.data, user?.reputation],
  );

  if (!userId) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(120).duration(420)}
      className="flex-row flex-wrap gap-2.5"
      style={{ paddingHorizontal: screenPadding }}
    >
      {tiles.map((tile) => (
        // Two per row on a phone, the same 2x2 the website falls back to below
        // its `lg` breakpoint. `48%` rather than a flex basis because the gap
        // is applied by the parent and would otherwise push the second tile on
        // to its own line.
        <View key={tile.key} style={{ width: '48%' }}>
          <StatsCard
            label={tile.label}
            value={tile.value}
            icon={tile.icon}
            accent={tile.accent}
            compact
          />
        </View>
      ))}
    </Animated.View>
  );
});
