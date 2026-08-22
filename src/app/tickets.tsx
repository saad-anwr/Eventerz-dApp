/**
 * Tickets.
 *
 * The wallet's NFT tickets, split into Upcoming / Past / Badges. Signed out it
 * shows the connect prompt rather than an empty list, because "no tickets" and
 * "no wallet" are different problems and should not look the same.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
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
import { useEventsByIds } from '@/hooks/use-events';
import { useRefresh } from '@/hooks/use-refresh';
import { useMyBadges, useMyTickets } from '@/hooks/use-tickets';
import { hasEnded } from '@/utils/rsvp';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Badge as BadgeModel, Ticket } from '@/types';
import { timeAgoLabel } from '@/utils/format';

type TabValue = 'upcoming' | 'past' | 'badges';

/**
 * Split tickets into upcoming and past.
 *
 * # What was wrong
 *
 * The docstring here said "reads the ticket's event so upcoming/past can be
 * split by start time", and the body read no event at all - it split on
 * `status === 'used'`, which records whether the holder was *scanned at the
 * door*, not whether the event happened.
 *
 * So a ticket for an event that ended weeks ago sat under "Upcoming",
 * labelled Valid, for as long as nobody checked in - and not checking in is
 * the ordinary case for an online event, an event you skipped, or any event
 * whose host never scanned anyone. The clocks disagreed across the app too:
 * the same event correctly reads "Ended" on a profile card.
 *
 * # The rule
 *
 * A ticket is past when its event is over, or when it has already been used.
 * Both, because they fail in opposite directions: time alone would move a
 * ticket that was scanned early back to "Upcoming" until the event ends, and
 * status alone is the bug above.
 *
 * An event that has not loaded yet stays upcoming. That is the safer default -
 * a ticket you still need is worse to hide than one that lingers a moment.
 *
 * "Over" is `hasEnded` rather than a comparison written here. It already
 * handles the optional `endsAt`, it matches what `request_to_join` enforces
 * server-side, and it is the same helper that makes an event card read
 * "Ended" - so the two surfaces cannot drift apart again.
 */
function useTicketPartition(tickets: Ticket[]) {
  const eventIds = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.eventId))),
    [tickets],
  );
  // Same query key the ticket cards use, so this reads their cache rather than
  // refetching. See `useEventsByIds`.
  const events = useEventsByIds(eventIds);

  return useMemo(() => {
    const upcoming: Ticket[] = [];
    const past: Ticket[] = [];

    tickets.forEach((ticket) => {
      const event = events.get(ticket.eventId);
      if (ticket.status === 'used' || (event && hasEnded(event))) {
        past.push(ticket);
      } else {
        upcoming.push(ticket);
      }
    });

    return { upcoming, past };
  }, [tickets, events]);
}

function BadgeTile({ badge }: { badge: BadgeModel }) {
  const color = accents[badge.accent];

  return (
    <View
      className="flex-1 items-center border border-white/10 bg-white/[0.035] p-4"
      style={{ borderRadius: radius['2xl'], minWidth: 150 }}
      accessible
      accessibilityLabel={`${badge.name}. ${badge.description}. Earned ${timeAgoLabel(badge.earnedAt)}`}
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
        {timeAgoLabel(badge.earnedAt)}
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
  const { control } = useRefresh([queryKeys.tickets.all]);

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
          {/*
            Was "Compressed NFTs held by your wallet", which asserted a standard
            for every row in the list. Tickets are only cNFTs once a Bubblegum
            mint has happened, and with `EXPO_PUBLIC_MERKLE_TREE_ADDRESS` blank
            none of them are - `mint-cnft` returns `not-configured` rather than
            inventing an asset id.

            Left neutral rather than made conditional on the tree, because this
            list can hold a *mix* once minting is switched on mid-life: older
            tickets stay Postgres records while new ones mint. A single label
            over a mixed list is wrong whichever standard it names, so it names
            neither. `ticket/[id]` states the standard per ticket, which is the
            only place that can be accurate about it.
          */}
          <Text variant="bodySm" className="mt-1 text-muted-foreground">
            Tickets and attendance badges you hold
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
          refreshControl={control}
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
        refreshControl={control}
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
                  ? 'RSVP to an event and your ticket appears here instantly.'
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
