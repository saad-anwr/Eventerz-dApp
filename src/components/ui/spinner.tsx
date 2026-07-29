/**
 * Branded loading spinner — a rotating gradient arc rather than the platform
 * `ActivityIndicator`, so loading states stay on-brand.
 */

import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/colors';

import { Text } from './text';

export const Spinner = memo(function Spinner({
  size = 28,
  label,
}: {
  size?: number;
  /** Optional caption under the spinner, also used as the a11y label. */
  label?: string;
}) {
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const stroke = Math.max(2, size * 0.1);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      className="items-center gap-3"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <Animated.View style={animatedStyle}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="spinner-grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={brand.purple} />
              <Stop offset="0.5" stopColor={brand.blue} />
              <Stop offset="1" stopColor={brand.cyan} stopOpacity="0.2" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#spinner-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.7} ${circumference}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
      {label && (
        <Text variant="bodySm" className="text-muted-foreground">
          {label}
        </Text>
      )}
    </View>
  );
});

/** Full-screen centred spinner for route-level suspense. */
export const ScreenLoader = memo(function ScreenLoader({
  label = 'Loading',
}: {
  label?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-brand-bg">
      <Spinner size={36} label={label} />
    </View>
  );
});
