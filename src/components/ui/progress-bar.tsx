/** Gradient progress bar — event capacity fill and the Create wizard stepper. */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { gradients } from '@/theme/colors';
import { motion, radius } from '@/theme/layout';
import { cn } from '@/utils/cn';

export const ProgressBar = memo(function ProgressBar({
  /** 0–100. */
  percent,
  height = 6,
  className,
  label,
}: {
  percent: number;
  height?: number;
  className?: string;
  /** Screen-reader description, e.g. "42 of 300 spots taken". */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: motion.duration.slow });
  }, [clamped, progress, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View
      className={cn('overflow-hidden bg-white/10', className)}
      style={{ height, borderRadius: radius.full }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? `${clamped}% full`}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <Animated.View style={[{ height: '100%' }, fillStyle]}>
        <LinearGradient
          colors={[...gradients.brand.colors]}
          locations={[...gradients.brand.locations]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: radius.full }}
        />
      </Animated.View>
    </View>
  );
});
