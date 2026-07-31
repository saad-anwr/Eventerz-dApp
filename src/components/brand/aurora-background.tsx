/**
 * Ambient background wash.
 *
 * The web app layers CSS radial gradients behind every section. This is the
 * native equivalent, drawn with SVG radial gradients.
 *
 * # Why SVG and not a tinted View
 *
 * The previous version used large circular `View`s at 8-16% opacity, described
 * in its own comment as "heavily blurred". They were not blurred - React Native
 * has no blur on a plain View - so each one rendered as a solid disc with a
 * hard, perfectly circular edge. At these sizes that edge cuts a visible arc
 * across the screen, which is what made the background read as generated rather
 * than designed: real ambient light has no boundary.
 *
 * An SVG `RadialGradient` fades colour to fully transparent, so there is no edge
 * to see. `react-native-svg` is already a dependency, so this costs nothing new.
 *
 * # Why the animation still lives on the View
 *
 * Animating SVG attributes means recomputing the gradient every frame. Animating
 * the wrapping `Animated.View`'s transform is GPU-composited, so the drift stays
 * smooth while the gradient itself is rasterised once.
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
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BlobProps {
  /** Unique within its own <Svg>, but kept globally distinct for clarity. */
  id: string;
  color: string;
  size: number;
  top: number;
  left: number;
  /** Opacity at the centre. Falls to zero at the rim. */
  intensity: number;
  /** Milliseconds for one full drift cycle. */
  duration: number;
  /** Vertical travel in px. */
  travel: number;
}

const Blob = memo(function Blob({
  id,
  color,
  size,
  top,
  left,
  intensity,
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
        { position: 'absolute', top, left, width: size, height: size },
        animatedStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          {/*
            Four stops rather than two. A straight centre-to-transparent ramp
            falls off linearly and still reads as a disc; holding more colour
            through the first third and then dropping away quickly is closer to
            how light actually pools.
          */}
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={intensity} />
            <Stop offset="0.35" stopColor={color} stopOpacity={intensity * 0.6} />
            <Stop offset="0.7" stopColor={color} stopOpacity={intensity * 0.18} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={size / 2}
          cy={size / 2}
          rx={size / 2}
          ry={size / 2}
          fill={`url(#${id})`}
        />
      </Svg>
    </Animated.View>
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
      {/*
        Asymmetric on purpose. Three evenly spaced blobs of similar size read as
        a pattern; varying the sizes and letting them overlap unevenly is what
        makes it look lit rather than tiled. The drift periods are deliberately
        coprime-ish so the three never visibly sync up.
      */}
      <Blob
        id="aurora-purple"
        color={brand.purple}
        size={SCREEN_WIDTH * 1.5}
        top={-SCREEN_WIDTH * 0.72}
        left={-SCREEN_WIDTH * 0.45}
        intensity={0.3}
        duration={11000}
        travel={22}
      />
      <Blob
        id="aurora-blue"
        color={brand.blue}
        size={SCREEN_WIDTH * 1.15}
        top={SCREEN_WIDTH * 0.5}
        left={SCREEN_WIDTH * 0.3}
        intensity={0.2}
        duration={14000}
        travel={-18}
      />
      <Blob
        id="aurora-cyan"
        color={brand.cyan}
        size={SCREEN_WIDTH * 0.95}
        top={SCREEN_WIDTH * 1.45}
        left={-SCREEN_WIDTH * 0.35}
        intensity={0.14}
        duration={17000}
        travel={15}
      />
    </View>
  );
});
