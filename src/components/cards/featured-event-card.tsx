/**
 * Tall hero card for the Home carousel.
 *
 * Full-bleed gradient with a bottom scrim so the title stays legible, plus a
 * parallax tilt driven by the carousel's scroll position - cards scale and fade
 * as they leave the centre, the way Coinbase and Luma treat featured content.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useUser } from '@/hooks/use-users';
import { brand, resolveCoverGradient } from '@/theme/colors';
import { radius, shadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { EventItem } from '@/types';
import {
  countdownLabel,
  compactNumber,
  formatEventDate,
} from '@/utils/format';
import { goingCount } from '@/utils/rsvp';

import { Avatar } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Globe, MapPin, Users } from '../ui/icon';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

export interface FeaturedEventCardProps {
  event: EventItem;
  onPress: (event: EventItem) => void;
  width: number;
  height?: number;
  /** Carousel scroll offset in px - drives the parallax. */
  scrollX?: SharedValue<number>;
  /** This card's index in the carousel. */
  index?: number;
  /** Width of one snap interval (card width + gap). */
  snapInterval?: number;
}

export const FeaturedEventCard = memo(function FeaturedEventCard({
  event,
  onPress,
  width,
  height = 300,
  scrollX,
  index = 0,
  snapInterval = width,
}: FeaturedEventCardProps) {
  const { data: host } = useUser(event.hostId);
  const colors = resolveCoverGradient(event.coverGradient);
  const countdown = countdownLabel(event.startsAt, event.endsAt);
  const isLive = countdown === 'Live now';

  const handlePress = useCallback(() => onPress(event), [event, onPress]);

  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollX) return {};
    const inputRange = [
      (index - 1) * snapInterval,
      index * snapInterval,
      (index + 1) * snapInterval,
    ];
    return {
      transform: [
        {
          scale: interpolate(
            scrollX.value,
            inputRange,
            [0.93, 1, 0.93],
            Extrapolation.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        scrollX.value,
        inputRange,
        [0.6, 1, 0.6],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <Animated.View style={parallaxStyle}>
      <PressableScale
        onPress={handlePress}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${event.title}, ${formatEventDate(
          event.startsAt,
        )}, ${event.location}`}
        accessibilityHint="Opens the event details"
        className="overflow-hidden"
        style={[{ width, height, borderRadius: radius['4xl'] }, shadow.card]}
      >
        <LinearGradient
          colors={[colors[0], colors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.30)', 'transparent']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 0.65 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        {/* Bottom scrim keeps the copy readable over any gradient. */}
        <LinearGradient
          colors={['transparent', 'rgba(5,8,22,0.55)', 'rgba(5,8,22,0.92)']}
          locations={[0.35, 0.68, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />

        {/* Top row */}
        <View className="flex-row items-start justify-between p-4">
          <View className="flex-row gap-2">
            <Badge label={event.category} variant="default" size="sm" />
            {event.tokenGated && (
              <Badge label="Token-gated" variant="purple" size="sm" />
            )}
          </View>
          {isLive ? (
            <Badge label="Live now" variant="live" size="sm" dot />
          ) : (
            <View className="rounded-full bg-black/40 px-2.5 py-1">
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 10,
                  color: brand.cyan,
                }}
              >
                {countdown}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom content */}
        <View className="mt-auto p-5">
          <Text variant="caption" style={{ color: brand.cyan }}>
            {formatEventDate(event.startsAt)}
          </Text>

          <Text variant="h2" numberOfLines={2} className="mt-1.5">
            {event.title}
          </Text>

          <View className="mt-3.5 flex-row items-center gap-2.5">
            <Avatar name={host?.name ?? 'Host'} seed={event.hostId} size="sm" uri={host?.avatarUrl} />
            <View className="flex-1">
              <Text variant="bodySm" numberOfLines={1}>
                {host?.name ?? 'Unknown host'}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                {event.isOnline ? (
                  <Globe size={11} color={themeColors.mutedForeground} strokeWidth={2} />
                ) : (
                  <MapPin size={11} color={themeColors.mutedForeground} strokeWidth={2} />
                )}
                <Text
                  variant="caption"
                  className="text-muted-foreground"
                  numberOfLines={1}
                >
                  {event.location}
                </Text>
              </View>
            </View>

            <View className="items-end">
              <Text
                style={{
                  fontFamily: fontFamily.displayBold,
                  fontSize: 16,
                  color: '#ffffff',
                }}
              >
                {event.price}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <Users size={11} color={themeColors.mutedForeground} strokeWidth={2} />
                <Text variant="caption" className="text-muted-foreground">
                  {compactNumber(goingCount(event))}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});
