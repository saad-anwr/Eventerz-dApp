/**
 * Notifications timeline.
 *
 * Grouped by day with a connecting rail, so a burst of activity reads as one
 * session rather than a flat wall of rows.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CheckCheck,
  Info,
  Ticket,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { queryKeys } from '@/hooks/query-keys';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/use-notifications';
import { useRefresh } from '@/hooks/use-refresh';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { AppNotification, NotificationKind } from '@/types';
import { dayLabel, timeAgo } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const KIND_META: Record<
  NotificationKind,
  { icon: LucideIcon; accent: keyof typeof accents }
> = {
  wallet: { icon: Wallet, accent: 'purple' },
  'event-reminder': { icon: CalendarCheck, accent: 'blue' },
  ticket: { icon: Ticket, accent: 'cyan' },
  community: { icon: Users, accent: 'green' },
  reputation: { icon: Trophy, accent: 'cyan' },
  system: { icon: Info, accent: 'purple' },
};

function NotificationRow({
  item,
  index,
  isLast,
  onPress,
}: {
  item: AppNotification;
  index: number;
  isLast: boolean;
  onPress: (item: AppNotification) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const color = accents[meta.accent];

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(340)}>
      <PressableFade
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}. ${timeAgo(item.createdAt)} ago${
          item.read ? '' : '. Unread'
        }`}
        className="flex-row gap-3.5"
      >
        {/* Rail */}
        <View className="items-center">
          <View
            className="items-center justify-center"
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.md,
              backgroundColor: `${color}1c`,
              borderWidth: 1,
              borderColor: `${color}30`,
            }}
          >
            <Icon size={17} color={color} strokeWidth={2.1} />
          </View>
          {!isLast && <View className="w-px flex-1 bg-white/10" />}
        </View>

        <View className="flex-1 pb-5">
          <View className="flex-row items-start justify-between gap-3">
            <Text
              variant="title"
              className="flex-1"
              numberOfLines={2}
              style={{
                fontFamily: item.read
                  ? fontFamily.medium
                  : fontFamily.semibold,
              }}
            >
              {item.title}
            </Text>
            {!item.read && (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  marginTop: 7,
                  backgroundColor: brand.purple,
                }}
              />
            )}
          </View>

          <Text variant="bodySm" className="mt-1 text-muted-foreground">
            {item.body}
          </Text>

          <Text variant="micro" className="mt-1.5 text-muted-foreground">
            {timeAgo(item.createdAt)} ago
          </Text>
        </View>
      </PressableFade>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { refreshing, onRefresh } = useRefresh([queryKeys.notifications.all]);

  const sections = useMemo(() => {
    const grouped = new Map<string, AppNotification[]>();
    (notifications.data ?? []).forEach((item) => {
      const key = dayLabel(item.createdAt);
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    });
    return Array.from(grouped, ([title, data]) => ({ title, data }));
  }, [notifications.data]);

  const unreadCount = (notifications.data ?? []).filter((n) => !n.read).length;

  const handlePress = useCallback(
    (item: AppNotification) => {
      haptics.light();
      if (!item.read) markRead.mutate(item.id);
      if (item.href) {
        // Notification hrefs are internal app routes authored in our own data.
        router.push(item.href as never);
      }
    },
    [markRead, router],
  );

  return (
    <Screen edgeTop={false}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between gap-3"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
          paddingBottom: 12,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
          size={40}
          iconSize={18}
        />

        <View className="flex-1">
          <Text variant="h3" accessibilityRole="header">
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Text variant="caption" className="text-muted-foreground">
              {unreadCount} unread
            </Text>
          )}
        </View>

        {unreadCount > 0 && (
          <PressableFade
            onPress={() => {
              haptics.success();
              markAllRead.mutate();
            }}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            hitSlop={10}
            className="flex-row items-center gap-1.5 px-2 py-2"
          >
            <CheckCheck size={14} color={brand.cyan} strokeWidth={2.3} />
            <Text variant="label" style={{ color: brand.cyan }}>
              Mark all
            </Text>
          </PressableFade>
        )}
      </View>

      {notifications.isLoading ? (
        <View className="gap-4" style={{ paddingHorizontal: screenPadding }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} radius={16} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: screenPadding,
            paddingBottom: insets.bottom + 32,
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
          renderSectionHeader={({ section }) => (
            <Text
              variant="label"
              className="mb-3.5 mt-2 uppercase tracking-wider text-muted-foreground"
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item, index, section }) => (
            <NotificationRow
              item={item}
              index={index}
              isLast={index === section.data.length - 1}
              onPress={handlePress}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={Bell}
              title="Nothing yet"
              description="Wallet updates, event reminders and community news land here."
            />
          }
          ListFooterComponent={
            sections.length > 0 ? (
              <View className="items-center pt-4">
                <BadgeCheck size={15} color="#475569" strokeWidth={2} />
                <Text variant="micro" className="mt-2 text-muted-foreground">
                  You&apos;re all caught up
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  );
}
