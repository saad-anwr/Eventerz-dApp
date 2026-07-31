/**
 * Ambient background wash.
 *
 * The web app layers radial gradient blobs (`components/ui/gradient-blob.tsx`)
 * behind every section. React Native has no radial gradient, so we approximate
 * with large, heavily-blurred circular Views tinted with the brand hues -
 * cheap, GPU-composited, and visually very close at these opacities.
 *
 * Purely decorative: hidden from screen readers and non-interactive.
 */

import { memo, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BlobProps {
  color: string;
  size: number;
  top: number;
  left: number;
  opacity: number;
  /** Seconds for one full drift cycle. */
  duration: number;
  /** Vertical travel in px. */
  travel: number;
}

const Blob = memo(function Blob({
  color,
  size,
  top,
  left,
  opacity,
  duration,
  travel,
}: BlobProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * travel }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top,
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
        },
        animatedStyle,
      ]}
    />
  );
});

export const AuroraBackground = memo(function AuroraBackground() {
  return (
    <View
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: 'none' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Blob
        color={brand.purple}
        size={SCREEN_WIDTH * 1.1}
        top={-SCREEN_WIDTH * 0.55}
        left={-SCREEN_WIDTH * 0.35}
        opacity={0.16}
        duration={9000}
        travel={26}
      />
      <Blob
        color={brand.blue}
        size={SCREEN_WIDTH * 0.9}
        top={SCREEN_WIDTH * 0.45}
        left={SCREEN_WIDTH * 0.45}
        opacity={0.11}
        duration={11000}
        travel={-22}
      />
      <Blob
        color={brand.cyan}
        size={SCREEN_WIDTH * 0.75}
        top={SCREEN_WIDTH * 1.35}
        left={-SCREEN_WIDTH * 0.25}
        opacity={0.08}
        duration={13000}
        travel={18}
      />
    </View>
  );
});
