/**
 * Shimmer skeleton.
 *
 * Reproduces the web app's `animate-shimmer` - a highlight swept across a
 * muted block - with a single Reanimated loop driving a translated gradient.
 * The animation runs on the UI thread, so a screenful of skeletons costs
 * nothing on the JS thread while data loads.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { gradients } from '@/theme/colors';
import { radius as radii } from '@/theme/layout';
import { cn } from '@/utils/cn';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  className?: string;
  style?: ViewStyle;
}

export const Skeleton = memo(function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.md,
  className,
  style,
}: SkeletonProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value * 2 - 1) * 220 }],
  }));

  return (
    <View
      className={cn('overflow-hidden bg-white/[0.06]', className)}
      style={[{ width, height, borderRadius: radius }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduceMotion && (
        <Animated.View
          style={[
            { position: 'absolute', top: 0, bottom: 0, width: 220 },
            sheenStyle,
          ]}
        >
          <LinearGradient
            colors={[...gradients.sheen.colors]}
            locations={[...gradients.sheen.locations]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
});

/** Skeleton shaped like an `<EventCard>`, for Discover and Home rails. */
export const EventCardSkeleton = memo(function EventCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
      <Skeleton height={128} radius={0} />
      <View className="gap-2.5 p-4">
        <Skeleton width="45%" height={12} />
        <Skeleton width="85%" height={18} />
        <View className="mt-1 flex-row items-center gap-2">
          <Skeleton width={24} height={24} radius={12} />
          <Skeleton width="35%" height={12} />
        </View>
        <View className="mt-2 flex-row gap-3">
          <Skeleton width="40%" height={12} />
          <Skeleton width="20%" height={12} />
        </View>
      </View>
    </View>
  );
});

/** A vertical run of card skeletons - the default list loading state. */
export const EventListSkeleton = memo(function EventListSkeleton({
  count = 3,
}: {
  count?: number;
}) {
  return (
    <View className="gap-4">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </View>
  );
});
