/**
 * Tickets.
 *
 * The wallet's NFT tickets, split into Upcoming / Past / Badges. Signed out it
 * shows the connect prompt rather than an empty list, because "no tickets" and
 * "no wallet" are different problems and should not look the same.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { NftTicketCard } from '@/components/cards/nft-ticket-card';
import { SegmentedControl } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Compass,
  DynamicIcon,
  QrCode,
  Ticket as TicketIcon,
  Trophy,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen, useListBottomPadding } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { ConnectWalletPrompt, ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import { queryKeys } from '@/hooks/query-keys';
import { useRefresh } from '@/hooks/use-refresh';
import { useMyBadges, useMyTickets } from '@/hooks/use-tickets';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Badge as BadgeModel, Ticket } from '@/types';
import { timeAgo } from '@/utils/format';

type TabValue = 'upcoming' | 'past' | 'badges';

/** Reads the ticket's event so upcoming/past can be split by start time. */
function useTicketPartition(tickets: Ticket[]) {
  // The events are already in the query cache from the ticket cards, so this
  // is a cache read rather than a second round of fetches.
  return useMemo(() => {
    const upcoming: Ticket[] = [];
    const past: Ticket[] = [];
    tickets.forEach((ticket) => {
      if (ticket.status === 'used') past.push(ticket);
      else upcoming.push(ticket);
    });
    return { upcoming, past };
  }, [tickets]);
}

function BadgeTile({ badge }: { badge: BadgeModel }) {
  const color = accents[badge.accent];

  return (
    <View
      className="flex-1 items-center border border-white/10 bg-white/[0.035] p-4"
      style={{ borderRadius: radius['2xl'], minWidth: 150 }}
      accessible
      accessibilityLabel={`${badge.name}. ${badge.description}. Earned ${timeAgo(badge.earnedAt)} ago`}
    >
      <View
        className="items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: `${color}1c`,
          borderWidth: 1,
          borderColor: `${color}38`,
        }}
      >
        <DynamicIcon
          name={badge.icon}
          size={24}
          color={color}
          strokeWidth={1.9}
        />
      </View>
      <Text variant="title" className="mt-3 text-center" numberOfLines={1}>
        {badge.name}
      </Text>
      <Text
        variant="caption"
        className="mt-1 text-center text-muted-foreground"
        numberOfLines={2}
      >
        {badge.description}
      </Text>
      <Text variant="micro" className="mt-2 text-muted-foreground">
        {timeAgo(badge.earnedAt)} ago
      </Text>
    </View>
  );
}

export default function TicketsScreen() {
  const router = useRouter();
  const bottomPadding = useListBottomPadding();
  const [tab, setTab] = useState<TabValue>('upcoming');

  const { isConnected, sheetVisible, openSheet, closeSheet, handleConnected } =
    useConnectWallet();

  const tickets = useMyTickets();
  const badges = useMyBadges();
  const { refreshing, onRefresh } = useRefresh([queryKeys.tickets.all]);

  const { upcoming, past } = useTicketPartition(tickets.data ?? []);

  const openTicket = useCallback(
    (ticket: Ticket) => router.push(`/ticket/${ticket.id}`),
    [router],
  );

  const visible = tab === 'upcoming' ? upcoming : past;

  if (!isConnected) {
    return (
      <Screen tabBarInset padded>
        <View className="flex-1 justify-center">
          <ConnectWalletPrompt
            title="Your tickets live in your wallet"
            description="Connect to see the NFT tickets and attendance badges you already hold."
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

  const header = (
    <View style={{ paddingBottom: 18 }}>
      <View
        className="flex-row items-start justify-between gap-3"
        style={{ paddingHorizontal: screenPadding, paddingTop: 8 }}
      >
        <View className="flex-1">
          <Text variant="h1" accessibilityRole="header">
            Tickets
          </Text>
          <Text variant="bodySm" className="mt-1 text-muted-foreground">
            Compressed NFTs held by your wallet
          </Text>
        </View>

        <PressableScale
          onPress={() => router.push('/scan')}
          scaleTo={0.92}
          accessibilityRole="button"
          accessibilityLabel="Scan a ticket QR code"
          className="flex-row items-center gap-1.5 border border-brand-cyan/35 bg-brand-cyan/10 px-3.5"
          style={{ height: 44, borderRadius: radius.full }}
        >
          <QrCode size={15} color={brand.cyan} strokeWidth={2.2} />
          <Text
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 13,
              color: brand.cyan,
            }}
          >
            Scan
          </Text>
        </PressableScale>
      </View>

      <View className="mt-5" style={{ paddingHorizontal: screenPadding }}>
        <SegmentedControl
          options={[
            { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
            { value: 'past', label: 'Past', count: past.length },
            {
              value: 'badges',
              label: 'Badges',
              count: badges.data?.length ?? 0,
            },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
    </View>
  );

  if (tab === 'badges') {
    return (
      <Screen>
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
          {header}

          {badges.isLoading ? (
            <View
              className="flex-row flex-wrap gap-3"
              style={{ paddingHorizontal: screenPadding }}
            >
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} width={160} height={172} radius={20} />
              ))}
            </View>
          ) : (badges.data ?? []).length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No badges yet"
              description="Check in at your first event to earn a Proof-of-Attendance badge."
              actionLabel="Find an event"
              onAction={() => router.push('/explore')}
            />
          ) : (
            <View
              className="flex-row flex-wrap gap-3"
              style={{ paddingHorizontal: screenPadding }}
            >
              {(badges.data ?? []).map((badge, index) => (
                <Animated.View
                  key={badge.id}
                  entering={FadeInDown.delay(index * 60).duration(360)}
                  style={{ width: '47.5%', flexGrow: 1 }}
                >
                  <BadgeTile badge={badge} />
                </Animated.View>
              ))}
            </View>
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginHorizontal: -screenPadding }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingBottom: bottomPadding,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.purple}
            colors={[brand.purple, brand.cyan]}
            progressBackgroundColor="#0b1024"
          />
        }
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(Math.min(index, 5) * 60).duration(360)}
          >
            <NftTicketCard ticket={item} onPress={openTicket} />
          </Animated.View>
        )}
        ListEmptyComponent={
          tickets.isLoading ? (
            <View className="gap-4">
              <Skeleton height={190} radius={24} />
              <Skeleton height={190} radius={24} />
            </View>
          ) : (
            <EmptyState
              icon={tab === 'upcoming' ? TicketIcon : Compass}
              title={
                tab === 'upcoming'
                  ? 'No upcoming tickets'
                  : 'Nothing attended yet'
              }
              description={
                tab === 'upcoming'
                  ? 'RSVP to an event and your NFT ticket appears here instantly.'
                  : 'Tickets move here once you check in at the door.'
              }
              actionLabel="Discover events"
              onAction={() => router.push('/explore')}
            />
          )
        }
      />
    </Screen>
  );
}
