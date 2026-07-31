/**
 * Drifting particle field - port of the web app's `components/ui/particles.tsx`.
 *
 * Used on the splash and onboarding screens. Each particle is one small
 * Reanimated view running an independent loop on the UI thread; the count is
 * deliberately low (24) because dozens of animated views is where Android
 * starts dropping frames.
 */

import { memo, useEffect, useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/colors';

const { width: W, height: H } = Dimensions.get('window');
const COLORS = [brand.purple, brand.blue, brand.cyan, brand.green];

interface ParticleSpec {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  drift: number;
}

const Particle = memo(function Particle({ spec }: { spec: ParticleSpec }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, {
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
  }, [progress, reduceMotion, spec.delay, spec.duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -progress.value * spec.drift },
      { translateX: progress.value * spec.drift * 0.35 },
    ],
    opacity: 0.25 + progress.value * 0.55,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x,
          top: spec.y,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
        },
        animatedStyle,
      ]}
    />
  );
});

export const Particles = memo(function Particles({
  count = 24,
}: {
  count?: number;
}) {
  const specs = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: count }, (_, id) => ({
        id,
        x: Math.random() * W,
        y: Math.random() * H,
        size: 1.5 + Math.random() * 3,
        color: COLORS[id % COLORS.length],
        duration: 3200 + Math.random() * 3600,
        delay: Math.random() * 2200,
        drift: 28 + Math.random() * 70,
      })),
    [count],
  );

  return (
    <View
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {specs.map((spec) => (
        <Particle key={spec.id} spec={spec} />
      ))}
    </View>
  );
});
