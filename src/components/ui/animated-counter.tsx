/**
 * Animated counter - port of the web app's `components/ui/animated-counter.tsx`.
 *
 * Counts up on mount with an ease-out curve. The tick runs through a Reanimated
 * shared value and writes into the Text via `setNativeProps`-style animated
 * props, so the JS thread is not driving a 60-step re-render.
 */

import { memo, useEffect } from 'react';
import { TextInput, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

/**
 * A read-only TextInput is the standard trick for animating text content on
 * the UI thread - `Animated.Text` cannot animate its children, but
 * `TextInput.value` is an animatable prop.
 */
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Format large values as 1.2K / 480K. */
  compact?: boolean;
  className?: string;
  style?: TextStyle;
}

export const AnimatedCounter = memo(function AnimatedCounter({
  value,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  compact = false,
  className,
  style,
}: AnimatedCounterProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.value = value;
      return;
    }
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const current = progress.value;

    let text: string;
    if (compact && Math.abs(current) >= 1000) {
      if (Math.abs(current) >= 1_000_000) {
        text = `${(current / 1_000_000).toFixed(1)}M`;
      } else {
        text = `${(current / 1000).toFixed(current >= 10_000 ? 0 : 1)}K`;
      }
    } else {
      text = current.toFixed(decimals);
    }

    return { text: `${prefix}${text}${suffix}`, defaultValue: '' };
  });

  return (
    <AnimatedTextInput
      editable={false}
      // A counter is decorative motion; screen readers get the settled value.
      accessible
      accessibilityLabel={`${prefix}${value}${suffix}`}
      underlineColorAndroid="transparent"
      className={cn('text-foreground', className)}
      style={[
        {
          fontFamily: fontFamily.displayBold,
          fontSize: 24,
          padding: 0,
          margin: 0,
        },
        style,
      ]}
      animatedProps={animatedProps}
    />
  );
});
