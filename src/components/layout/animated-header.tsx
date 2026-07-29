/**
 * Scroll-reactive header.
 *
 * Transparent over a hero, then fades in a blurred bar with the title as the
 * user scrolls past `threshold`. The interpolation is driven by a shared value
 * fed from `useAnimatedScrollHandler`, so the header never lags the content.
 */

import { BlurView } from 'expo-blur';
import { memo, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { screenPadding } from '@/theme/layout';
import { cn } from '@/utils/cn';

import { IconButton } from '../ui/button';
import { ArrowLeft } from '../ui/icon';
import { Text } from '../ui/text';

export const HEADER_HEIGHT = 56;

export const AnimatedHeader = memo(function AnimatedHeader({
  title,
  scrollY,
  threshold = 160,
  onBack,
  right,
  className,
}: {
  title: string;
  scrollY: SharedValue<number>;
  /** Scroll offset at which the bar reaches full opacity. */
  threshold?: number;
  onBack?: () => void;
  right?: ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [threshold * 0.4, threshold],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [threshold * 0.6, threshold],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [threshold * 0.6, threshold],
          [8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      className={cn('absolute left-0 right-0 top-0', className)}
      style={{
        zIndex: 20,
        paddingTop: insets.top,
        pointerEvents: 'box-none',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
          },
          backdropStyle,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={50}
            tint="dark"
            style={{ position: 'absolute', inset: 0 }}
          />
        ) : (
          <View
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(5,8,22,0.94)' }}
          />
        )}
        <View className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
      </Animated.View>

      <View
        className="flex-row items-center justify-between gap-3"
        style={{ height: HEADER_HEIGHT, paddingHorizontal: screenPadding }}
      >
        {onBack ? (
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={onBack}
            variant="glass"
            size={38}
            iconSize={18}
          />
        ) : (
          <View style={{ width: 38 }} />
        )}

        <Animated.View style={titleStyle} className="flex-1">
          <Text
            variant="title"
            numberOfLines={1}
            className="text-center"
            accessibilityRole="header"
          >
            {title}
          </Text>
        </Animated.View>

        <View className="flex-row items-center gap-2" style={{ minWidth: 38 }}>
          {right}
        </View>
      </View>
    </View>
  );
});
