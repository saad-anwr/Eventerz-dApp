/**
 * Discover.
 *
 * Search + filters over an infinite, paginated feed. The list is a FlatList
 * with windowing tuned for card-sized rows, and the search input is debounced
 * so typing does not fire a query per keystroke.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EventCard } from '@/components/cards/event-card';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Grid2x2, Search } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen, useListBottomPadding } from '@/components/ui/screen';
import { SearchBar } from '@/components/ui/search-bar';
import { EventCardSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { FilterSheet } from '@/features/discover/filter-sheet';
import { queryKeys } from '@/hooks/query-keys';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useEventsFeed } from '@/hooks/use-events';
import { useRefresh } from '@/hooks/use-refresh';
import { useDiscoverStore } from '@/store/discover-store';
import { brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { EVENT_CATEGORIES, type EventItem } from '@/types';
import { plural } from '@/utils/format';
import { haptics } from '@/utils/haptics';

/** Categories surfaced as one-tap chips above the feed. */
const QUICK_CATEGORIES = [
  'DAO',
  'Hackathon',
  'Conference',
  'Meetup',
  'Workshop',
] as const;

export default function DiscoverScreen() {
  const router = useRouter();
  const bottomPadding = useListBottomPadding();

  const filters = useDiscoverStore((s) => s.filters);
  const setQuery = useDiscoverStore((s) => s.setQuery);
  const toggleCategory = useDiscoverStore((s) => s.toggleCategory);
  const activeCount = useDiscoverStore((s) => s.activeCount());

  const [searchInput, setSearchInput] = useState(filters.query);
  const [filterVisible, setFilterVisible] = useState(false);

  const debouncedQuery = useDebouncedValue(searchInput, 320);

  // The store holds the committed query; the input holds the in-flight one.
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  );

  const feed = useEventsFeed(effectiveFilters);
  const { refreshing, onRefresh } = useRefresh([queryKeys.events.all]);

  const events = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );
  const total = feed.data?.pages[0]?.total ?? 0;

  const openEvent = useCallback(
    (event: EventItem) => router.push(`/event/${event.id}`),
    [router],
  );

  const handleEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) {
      feed.fetchNextPage();
    }
  }, [feed]);

  const renderItem = useCallback(
    ({ item, index }: { item: EventItem; index: number }) => (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(360)}
      >
        <EventCard event={item} onPress={openEvent} />
      </Animated.View>
    ),
    [openEvent],
  );

  const keyExtractor = useCallback((item: EventItem) => item.id, []);

  const listHeader = (
    <View style={{ paddingBottom: 18 }}>
      <View style={{ paddingHorizontal: screenPadding }}>
        <Text variant="h1" accessibilityRole="header">
          Discover
        </Text>
        <Text variant="bodySm" className="mt-1 text-muted-foreground">
          {plural(total, 'event')} across every community
        </Text>
      </View>

      <View className="mt-4" style={{ paddingHorizontal: screenPadding }}>
        <SearchBar
          value={searchInput}
          onChangeText={(text) => {
            setSearchInput(text);
            setQuery(text);
          }}
          placeholder="Search events, tags, cities"
          trailing={
            <PressableScale
              onPress={() => {
                haptics.light();
                setFilterVisible(true);
              }}
              scaleTo={0.92}
              hapticFeedback={false}
              accessibilityRole="button"
              accessibilityLabel={
                activeCount > 0
                  ? `Filters, ${activeCount} active`
                  : 'Filters'
              }
              className="items-center justify-center border border-white/10 bg-white/[0.06]"
              style={{
                width: 50,
                height: 50,
                borderRadius: radius.full,
              }}
            >
              <Grid2x2 size={18} color="#f8fafc" strokeWidth={2} />
              {activeCount > 0 && (
                <View
                  className="absolute items-center justify-center border-2 border-brand-bg"
                  style={{
                    top: 4,
                    right: 4,
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
                    {activeCount}
                  </Text>
                </View>
              )}
            </PressableScale>
          }
        />
      </View>

      {/* Quick category chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={QUICK_CATEGORIES}
        keyExtractor={(item) => item}
        className="mt-3.5"
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          gap: 8,
        }}
        renderItem={({ item }) => (
          <Chip
            label={item}
            selected={filters.categories.includes(item)}
            onPress={() =>
              toggleCategory(
                item as (typeof EVENT_CATEGORIES)[number],
              )
            }
          />
        )}
      />

      {activeCount > 0 && (
        <Animated.View
          entering={FadeIn.duration(240)}
          className="mt-3.5 flex-row items-center gap-2"
          style={{ paddingHorizontal: screenPadding }}
        >
          <Badge
            label={`${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} active`}
            variant="purple"
            size="sm"
          />
          <Text variant="caption" className="text-muted-foreground">
            {plural(total, 'match', 'es')}
          </Text>
        </Animated.View>
      )}
    </View>
  );

  if (feed.isError) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ErrorState onRetry={() => feed.refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={events}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingBottom: bottomPadding,
          gap: 16,
        }}
        // Header manages its own gutter, so cancel the container padding there.
        ListHeaderComponentStyle={{
          marginHorizontal: -screenPadding,
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.purple}
            colors={[brand.purple, brand.cyan]}
            progressBackgroundColor="#0b1024"
          />
        }
        // Windowing tuned for ~230px rows: render a screen ahead, no more.
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          feed.isLoading ? (
            <View className="gap-4">
              <EventCardSkeleton />
              <EventCardSkeleton />
              <EventCardSkeleton />
            </View>
          ) : (
            <EmptyState
              icon={Search}
              title="No events match"
              description="Try a different search, or clear a filter or two."
              actionLabel="Clear filters"
              onAction={() => {
                useDiscoverStore.getState().reset();
                setSearchInput('');
              }}
            />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View className="items-center py-6">
              <Spinner size={24} />
            </View>
          ) : events.length > 0 && !feed.hasNextPage ? (
            <View className="items-center py-8">
              <Text variant="caption" className="text-muted-foreground">
                That&apos;s everything — {plural(total, 'event')}
              </Text>
            </View>
          ) : null
        }
      />

      <FilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        resultCount={total}
      />
    </Screen>
  );
}

