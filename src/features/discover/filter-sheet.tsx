/**
 * Discover filter sheet - date, category, location, sort and the two toggles.
 * Writes straight to `discoverStore`, which is the query key input, so applying
 * a filter re-runs the feed without any prop plumbing.
 */

import { memo } from 'react';
import { ScrollView, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FieldGroup, SwitchRow } from '@/components/ui/form';
import { Globe, Ticket } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useEventLocations } from '@/hooks/use-events';
import { useDiscoverStore } from '@/store/discover-store';
import { screenPadding } from '@/theme/layout';
import { EVENT_CATEGORIES, type DateFilter, type SortOrder } from '@/types';
import { haptics } from '@/utils/haptics';

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'soonest', label: 'Starting soonest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Recently added' },
];

export const FilterSheet = memo(function FilterSheet({
  visible,
  onClose,
  resultCount,
}: {
  visible: boolean;
  onClose: () => void;
  /** Live match count, so the apply button can state what it will show. */
  resultCount: number;
}) {
  const filters = useDiscoverStore((s) => s.filters);
  const toggleCategory = useDiscoverStore((s) => s.toggleCategory);
  const setDate = useDiscoverStore((s) => s.setDate);
  const setLocation = useDiscoverStore((s) => s.setLocation);
  const setSort = useDiscoverStore((s) => s.setSort);
  const toggleOnlineOnly = useDiscoverStore((s) => s.toggleOnlineOnly);
  const toggleFreeOnly = useDiscoverStore((s) => s.toggleFreeOnly);
  const reset = useDiscoverStore((s) => s.reset);

  const { data: locations = [] } = useEventLocations();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      subtitle="Narrow the feed to what you actually want"
      maxHeightRatio={0.88}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingTop: 18,
          paddingBottom: 8,
          gap: 24,
        }}
      >
        <FieldGroup title="Date">
          <View className="flex-row flex-wrap gap-2">
            {DATE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.date === option.value}
                onPress={() => setDate(option.value)}
              />
            ))}
          </View>
        </FieldGroup>

        <FieldGroup title="Category">
          <View className="flex-row flex-wrap gap-2">
            {EVENT_CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={category}
                selected={filters.categories.includes(category)}
                onPress={() => toggleCategory(category)}
              />
            ))}
          </View>
        </FieldGroup>

        {locations.length > 0 && (
          <FieldGroup title="Location">
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label="Anywhere"
                selected={filters.location === null}
                onPress={() => setLocation(null)}
              />
              {locations.map((location) => (
                <Chip
                  key={location}
                  label={location}
                  selected={filters.location === location}
                  onPress={() =>
                    setLocation(filters.location === location ? null : location)
                  }
                />
              ))}
            </View>
          </FieldGroup>
        )}

        <FieldGroup title="Sort by">
          <View className="flex-row flex-wrap gap-2">
            {SORT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.sort === option.value}
                onPress={() => setSort(option.value)}
              />
            ))}
          </View>
        </FieldGroup>

        <View className="border-t border-white/10 pt-1">
          <SwitchRow
            title="Online only"
            description="Hide events that need you to be somewhere"
            icon={Globe}
            value={filters.onlineOnly}
            onValueChange={toggleOnlineOnly}
          />
          <SwitchRow
            title="Free events only"
            description="Skip anything with a ticket price"
            icon={Ticket}
            value={filters.freeOnly}
            onValueChange={toggleFreeOnly}
          />
        </View>
      </ScrollView>

      <View
        className="flex-row gap-3 border-t border-white/10 pt-4"
        style={{ paddingHorizontal: screenPadding }}
      >
        <Button
          label="Reset"
          variant="secondary"
          onPress={() => {
            haptics.light();
            reset();
          }}
          className="flex-1"
        />
        <Button
          label={`Show ${resultCount}`}
          onPress={onClose}
          className="flex-1"
          accessibilityHint={`Applies filters and shows ${resultCount} events`}
        />
      </View>

      <Text
        variant="micro"
        className="mt-3 text-center text-muted-foreground"
        style={{ paddingHorizontal: screenPadding }}
      >
        Filters apply as you tap - close any time.
      </Text>
    </BottomSheet>
  );
});
