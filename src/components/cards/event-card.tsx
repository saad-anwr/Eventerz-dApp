/**
 * Event card - direct port of the web app's `components/app/event-card.tsx`.
 *
 * Same anatomy: gradient cover with a category pill and calendar tile, then a
 * body with the cyan date line, title, host row and location/attendee meta.
 *
 * Memoised and kept free of blur so a FlatList of these stays at 60fps.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { useUser } from '@/hooks/use-users';
import { brand, resolveCoverGradient } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { EventItem } from '@/types';
import { cn } from '@/utils/cn';
import {
  countdownLabel,
  eventDateParts,
  formatEventDate,
  isUpcoming,
} from '@/utils/format';
import { goingCount } from '@/utils/rsvp';

import { Avatar } from '../ui/avatar';
import { Globe, Lock, MapPin, Users } from '../ui/icon';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

export interface EventCardProps {
  event: EventItem;
  onPress: (event: EventItem) => void;
  /** Fixed width for horizontal rails; omit to fill the parent. */
  width?: number;
  className?: string;
}

export const EventCard = memo(function EventCard({
  event,
  onPress,
  width,
  className,
}: EventCardProps) {
  const { data: host } = useUser(event.hostId);
  const { month, day } = eventDateParts(event.startsAt);
  const upcoming = isUpcoming(event.startsAt);
  const colors = resolveCoverGradient(event.coverGradient);
  const countdown = countdownLabel(event.startsAt, event.endsAt);
  const isLive = countdown === 'Live now';

  const handlePress = useCallback(() => onPress(event), [event, onPress]);

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatEventDate(event.startsAt)}, ${
        event.location
      }, ${goingCount(event)} attending`}
      accessibilityHint="Opens the event details"
      className={cn(
        'overflow-hidden border border-white/10 bg-white/[0.035]',
        className,
      )}
      style={{ borderRadius: radius['3xl'], width }}
    >
      {/* Cover */}
      <View style={{ height: 128 }}>
        <LinearGradient
          colors={[colors[0], colors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        {/* Highlight sweep, matching the web card's radial overlay. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.32)', 'transparent']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.75, y: 0.9 }}
          style={{ position: 'absolute', inset: 0 }}
        />

        {/* Top-left pills */}
        <View className="absolute left-3 top-3 flex-row gap-1.5">
          <View className="rounded-full bg-black/35 px-2.5 py-1">
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: 10,
                color: '#ffffff',
              }}
            >
              {event.category}
            </Text>
          </View>
          {event.tokenGated && (
            <View className="flex-row items-center gap-1 rounded-full bg-black/35 px-2 py-1">
              <Lock size={9} color="#ffffff" strokeWidth={2.6} />
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 10,
                  color: '#ffffff',
                }}
              >
                Gated
              </Text>
            </View>
          )}
        </View>

        {/* Bottom-left calendar tile */}
        <View className="absolute bottom-3 left-3 flex-row items-center gap-2">
          <View className="items-center rounded-xl bg-black/45 px-2.5 py-1">
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: 9,
                color: 'rgba(255,255,255,0.8)',
                letterSpacing: 0.5,
              }}
            >
              {month}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.bold,
                fontSize: 14,
                lineHeight: 16,
                color: '#ffffff',
              }}
            >
              {day}
            </Text>
          </View>

          {isLive ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1">
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: brand.green,
                }}
              />
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 10,
                  color: brand.green,
                }}
              >
                Live now
              </Text>
            </View>
          ) : (
            !upcoming && (
              <View className="rounded-full bg-black/45 px-2 py-1">
                <Text
                  style={{
                    fontFamily: fontFamily.medium,
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  Ended
                </Text>
              </View>
            )
          )}
        </View>

        {/* Price */}
        <View className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1">
          <Text
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 11,
              color: '#ffffff',
            }}
          >
            {event.price}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View className="flex-1 p-4">
        <Text variant="caption" style={{ color: brand.cyan }}>
          {formatEventDate(event.startsAt)}
        </Text>

        <Text variant="title" numberOfLines={2} className="mt-1">
          {event.title}
        </Text>

        <View className="mt-3 flex-row items-center gap-2">
          <Avatar name={host?.name ?? 'Host'} seed={event.hostId} size="xs" />
          <Text
            variant="caption"
            className="flex-1 text-muted-foreground"
            numberOfLines={1}
          >
            {host?.name ?? 'Unknown host'}
          </Text>
        </View>

        <View className="mt-3 flex-row items-center gap-3">
          <View className="flex-1 flex-row items-center gap-1">
            {event.isOnline ? (
              <Globe size={13} color="#94a2b8" strokeWidth={2} />
            ) : (
              <MapPin size={13} color="#94a2b8" strokeWidth={2} />
            )}
            <Text
              variant="caption"
              className="flex-1 text-muted-foreground"
              numberOfLines={1}
            >
              {event.location}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Users size={13} color="#94a2b8" strokeWidth={2} />
            <Text variant="caption" className="text-muted-foreground">
              {goingCount(event)}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});
