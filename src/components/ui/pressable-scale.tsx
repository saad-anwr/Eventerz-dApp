/**
 * Press feedback primitive.
 *
 * The web app's buttons use `active:scale-[0.97]`. This reproduces that on
 * native with a Reanimated spring on the UI thread, so the scale never drops
 * frames behind a busy JS thread.
 *
 * Every interactive surface in the app composes this rather than reimplementing
 * press states.
 */

import { forwardRef, useCallback } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { TOUCH_TARGET, motion } from '@/theme/layout';
import { haptics } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  /** How far to scale down on press. */
  scaleTo?: number;
  /** Fire a light haptic tick on press-in. */
  hapticFeedback?: boolean;
  /** Dim while pressed, on top of the scale. */
  dim?: boolean;
  className?: string;
  /** Guarantees the ≥44px touch target even when the visual is smaller. */
  enforceTouchTarget?: boolean;
}

export const PressableScale = forwardRef<View, PressableScaleProps>(
  function PressableScale(
    {
      scaleTo = 0.96,
      hapticFeedback = true,
      dim = false,
      enforceTouchTarget = false,
      disabled,
      onPressIn,
      onPressOut,
      style,
      ...props
    },
    ref,
  ) {
    const pressed = useSharedValue(0);
    const reduceMotion = useReducedMotion();

    const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
      (event) => {
        pressed.value = reduceMotion
          ? 1
          : withSpring(1, motion.spring.snappy);
        if (hapticFeedback && !disabled) haptics.light();
        onPressIn?.(event);
      },
      [disabled, hapticFeedback, onPressIn, pressed, reduceMotion],
    );

    const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
      (event) => {
        pressed.value = reduceMotion
          ? 0
          : withSpring(0, motion.spring.gentle);
        onPressOut?.(event);
      },
      [onPressOut, pressed, reduceMotion],
    );

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: 1 - pressed.value * (1 - scaleTo) },
      ],
      opacity: dim ? 1 - pressed.value * 0.25 : 1,
    }));

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        // Widen the tap area without changing the layout box.
        hitSlop={enforceTouchTarget ? TOUCH_TARGET / 4 : undefined}
        style={[
          animatedStyle,
          disabled ? { opacity: 0.5 } : null,
          style as never,
        ]}
        {...props}
      />
    );
  },
);

/** Fade-only variant for rows where a scale would look twitchy. */
export const PressableFade = forwardRef<View, PressableScaleProps>(
  function PressableFade({ style, onPressIn, onPressOut, ...props }, ref) {
    const pressed = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: 1 - pressed.value * 0.35,
    }));

    return (
      <AnimatedPressable
        ref={ref}
        onPressIn={(e) => {
          pressed.value = withTiming(1, { duration: 90 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = withTiming(0, { duration: 160 });
          onPressOut?.(e);
        }}
        style={[animatedStyle, style as never]}
        {...props}
      />
    );
  },
);
