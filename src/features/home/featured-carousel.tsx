/**
 * Featured events carousel.
 *
 * Snap-paging horizontal list where cards scale and fade toward the edges. The
 * scroll offset is shared with each card so the parallax is computed on the UI
 * thread rather than re-rendering on every frame.
 */

import { memo, useCallback } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { FeaturedEventCard } from '@/components/cards/featured-event-card';
import { Skeleton } from '@/components/ui/skeleton';
import { screenPadding } from '@/theme/layout';
import type { EventItem } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - screenPadding * 2 - 28;
const CARD_GAP = 14;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

export const FeaturedCarousel = memo(function FeaturedCarousel({
  events,
  loading,
  onSelect,
}: {
  events: EventItem[];
  loading: boolean;
  onSelect: (event: EventItem) => void;
}) {
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const renderCard = useCallback(
    (event: EventItem, index: number) => (
      <FeaturedEventCard
        key={event.id}
        event={event}
        index={index}
        onPress={onSelect}
        width={CARD_WIDTH}
        scrollX={scrollX}
        snapInterval={SNAP_INTERVAL}
      />
    ),
    [onSelect, scrollX],
  );

  if (loading) {
    return (
      <View
        className="flex-row gap-3.5"
        style={{ paddingHorizontal: screenPadding }}
      >
        <Skeleton width={CARD_WIDTH} height={300} radius={32} />
      </View>
    );
  }

  if (events.length === 0) return null;

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={SNAP_INTERVAL}
      decelerationRate="fast"
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingHorizontal: screenPadding,
        gap: CARD_GAP,
      }}
      accessibilityRole="list"
      accessibilityLabel="Featured events"
    >
      {events.map(renderCard)}
    </Animated.ScrollView>
  );
});
