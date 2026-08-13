/**
 * Animated counter - counts up to its value on mount.
 *
 * # Why this is not the usual Reanimated trick
 *
 * This used to render a read-only `TextInput` and drive its `text` prop from
 * `useAnimatedProps`, which is the standard way to animate text content without
 * a re-render per frame: `Animated.Text` cannot animate its children, but
 * `TextInput.value` is an animatable prop.
 *
 * On this stack it rendered nothing at all. Every `StatsCard` on Profile showed
 * its icon and its label with an empty gap where the number belongs - "Attended
 * ␣", "Organized ␣", "Badges ␣" - while the counts in the segmented control
 * right below, which are plain `<Text>`, were correct. That is what made it look
 * like the two disagreed: one of them was not rendering a value at all.
 *
 * Two things were working against it. The worklet returned
 * `{ text, defaultValue: '' }`, and an empty `defaultValue` re-applied on every
 * frame is in a position to clobber the text it ships alongside. And the whole
 * approach leans on `TextInput` prop mutation, which is exactly the sort of
 * host-component detail that the New Architecture reimplemented - this project
 * is on RN 0.86 with Reanimated 4, which is Fabric-only, so there is no old
 * renderer to fall back to.
 *
 * A counter that reliably shows the wrong thing (nothing) is worse than one that
 * costs a few frames of JS, and this is at most three or four small tiles on a
 * screen. So it animates in JS and renders an ordinary `<Text>`: no host-prop
 * mutation, no worklet, nothing that depends on which renderer is in use.
 *
 * It is also better for accessibility. The old version put a focusable text
 * *field* into the page for what is a read-only number.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

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

/** Shared by the rendered label and the accessibility label, so they agree. */
function formatCount(
  current: number,
  decimals: number,
  compact: boolean,
): string {
  if (compact && Math.abs(current) >= 1000) {
    if (Math.abs(current) >= 1_000_000) {
      return `${(current / 1_000_000).toFixed(1)}M`;
    }
    return `${(current / 1000).toFixed(current >= 10_000 ? 0 : 1)}K`;
  }
  return current.toFixed(decimals);
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
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  /*
   * Read in the effect but deliberately not a dependency of it: it is where the
   * count should start *from*, which is a fact about the moment the value
   * changed. Listing it would restart the animation every frame it updates.
   */
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    if (from === value) return;

    const started = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const elapsed = Date.now() - started;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic, matching the curve this had as a Reanimated easing.
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (value - from) * eased);
      // Settle on the exact value rather than whatever the curve lands on.
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDisplay(value);
    });

    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  return (
    <Text
      className={cn('text-foreground', className)}
      style={[{ fontFamily: fontFamily.displayBold, fontSize: 24 }, style]}
      // The settled value, not the frame currently on screen - the count-up is
      // decoration and reading it aloud mid-flight would be noise.
      accessibilityLabel={`${prefix}${formatCount(value, decimals, compact)}${suffix}`}
    >
      {prefix}
      {formatCount(display, decimals, compact)}
      {suffix}
    </Text>
  );
});
