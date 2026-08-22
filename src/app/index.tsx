/**
 * Splash / route gate.
 *
 * Plays the animated Eventerz mark over a particle field, then routes to
 * onboarding (first launch) or the tab shell. The wait is real work - the
 * wallet restore is in flight - not an artificial delay, but a floor keeps the
 * animation from being cut off on a fast device.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Particles } from '@/components/brand/particles';
import { EventerzMark } from '@/components/brand/logo';
import { Text } from '@/components/ui/text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { siteConfig } from '@/constants';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWalletStore } from '@/store/wallet-store';
import { brand, gradients } from '@/theme/colors';
import { motion } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';

/** Minimum time the splash stays up, so the mark's animation completes. */
const MIN_SPLASH_MS = 1750;

export default function SplashGate() {
  const router = useRouter();
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const isRestoring = useWalletStore((s) => s.isRestoring);
  const reduceMotion = useReducedMotion();

  const [minElapsed, setMinElapsed] = useState(false);
  const hasNavigated = useRef(false);

  const markScale = useSharedValue(0.72);
  const markOpacity = useSharedValue(0);
  const haloScale = useSharedValue(0.8);
  const wordmarkY = useSharedValue(14);
  const wordmarkOpacity = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      markScale.value = 1;
      markOpacity.value = 1;
      haloScale.value = 1;
      wordmarkY.value = 0;
      wordmarkOpacity.value = 1;
      return;
    }

    markOpacity.value = withTiming(1, { duration: 420 });
    markScale.value = withSequence(
      withSpring(1.06, { damping: 12, stiffness: 140 }),
      withSpring(1, motion.spring.gentle),
    );
    haloScale.value = withRepeat(
      withTiming(1.18, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    wordmarkOpacity.value = withDelay(360, withTiming(1, { duration: 420 }));
    wordmarkY.value = withDelay(360, withSpring(0, motion.spring.gentle));
  }, [
    reduceMotion,
    markScale,
    markOpacity,
    haloScale,
    wordmarkY,
    wordmarkOpacity,
  ]);

  // Navigate once the animation floor has passed and the session is resolved.
  useEffect(() => {
    if (hasNavigated.current) return;
    if (!minElapsed || isRestoring) return;
    hasNavigated.current = true;
    router.replace(onboardingComplete ? '/(tabs)' : '/onboarding');
  }, [minElapsed, isRestoring, onboardingComplete, router]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: 0.5 - (haloScale.value - 1) * 1.4,
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  return (
    <Animated.View
      exiting={FadeOut.duration(260)}
      className="flex-1 items-center justify-center bg-brand-bg"
    >
      <LinearGradient
        colors={[...gradients.brandSoft.colors]}
        locations={[...gradients.brandSoft.locations]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0, opacity: 0.55 }}
      />

      <Particles count={28} />

      <View className="items-center">
        <View className="items-center justify-center">
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 150,
                height: 150,
                borderRadius: 75,
                backgroundColor: brand.purple,
              },
              haloStyle,
            ]}
          />
          <Animated.View style={markStyle}>
            <EventerzMark size={104} />
          </Animated.View>
        </View>

        <Animated.View style={wordmarkStyle} className="mt-7 items-center">
          <Text
            style={{
              fontFamily: fontFamily.displayBold,
              fontSize: 34,
              letterSpacing: -1,
            }}
          >
            Eventerz
          </Text>
          <Text
            variant="bodySm"
            className="mt-2 text-center text-muted-foreground"
            style={{ maxWidth: 280 }}
          >
            {siteConfig.tagline}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeIn.delay(900).duration(500)}
        className="absolute bottom-14 items-center"
      >
        <Text variant="micro" className="text-muted-foreground">
          BUILT ON SOLANA
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
