/**
 * Onboarding — three slides, swipeable, with a gradient progress rail.
 *
 * The slide content animates off the same shared scroll offset as the pager,
 * so the icon parallaxes against the copy instead of moving as one block.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Dimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/brand/aurora-background';
import { Logo } from '@/components/brand/logo';
import { Particles } from '@/components/brand/particles';
import { Button } from '@/components/ui/button';
import { ArrowRight, DynamicIcon } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { onboardingSlides, type OnboardingSlide } from '@/mock/onboarding';
import { AnalyticsEvent, analytics } from '@/services/analytics-service';
import { usePreferencesStore } from '@/store/preferences-store';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { haptics } from '@/utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function Slide({
  slide,
  index,
  scrollX,
}: {
  slide: OnboardingSlide;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const accent = accents[slide.accent];

  const inputRange = [
    (index - 1) * SCREEN_WIDTH,
    index * SCREEN_WIDTH,
    (index + 1) * SCREEN_WIDTH,
  ];

  // Icon drifts faster than the text — a subtle depth cue on swipe.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          inputRange,
          [SCREEN_WIDTH * 0.35, 0, -SCREEN_WIDTH * 0.35],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          scrollX.value,
          inputRange,
          [0.7, 1, 0.7],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollX.value,
          inputRange,
          [26, 0, 26],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      style={{ width: SCREEN_WIDTH, paddingHorizontal: screenPadding }}
      className="items-center justify-center"
    >
      <Animated.View style={iconStyle}>
        <View
          className="items-center justify-center overflow-hidden"
          style={{
            width: 140,
            height: 140,
            borderRadius: radius['4xl'],
            borderWidth: 1,
            borderColor: `${accent}38`,
          }}
        >
          <LinearGradient
            colors={[`${accent}30`, `${accent}0a`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <DynamicIcon
            name={slide.icon}
            size={58}
            color={accent}
            strokeWidth={1.5}
          />
        </View>
      </Animated.View>

      <Animated.View style={copyStyle} className="mt-11 items-center">
        <Text
          variant="label"
          style={{ color: accent, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          {slide.eyebrow}
        </Text>

        <Text variant="h1" className="mt-3 text-center">
          {slide.title}
        </Text>

        <Text
          variant="body"
          className="mt-3.5 text-center text-muted-foreground"
          style={{ maxWidth: 330 }}
        >
          {slide.body}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);

  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  const isLast = index === onboardingSlides.length - 1;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(
        event.nativeEvent.contentOffset.x / SCREEN_WIDTH,
      );
      if (next !== index) {
        haptics.selection();
        setIndex(next);
      }
    },
    [index],
  );

  const finish = useCallback(() => {
    haptics.success();
    analytics.track(AnalyticsEvent.OnboardingCompleted, { skipped: false });
    completeOnboarding();
    router.replace('/(tabs)');
  }, [completeOnboarding, router]);

  const skip = useCallback(() => {
    haptics.light();
    analytics.track(AnalyticsEvent.OnboardingCompleted, { skipped: true });
    completeOnboarding();
    router.replace('/(tabs)');
  }, [completeOnboarding, router]);

  const advance = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    haptics.light();
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    setIndex(next);
  }, [finish, index, isLast]);

  return (
    <View className="flex-1 bg-brand-bg">
      <AuroraBackground />
      <Particles count={18} />

      {/* Header */}
      <View
        className="flex-row items-center justify-between"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
        }}
      >
        <Logo size={30} glow={false} />
        <PressableFade
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={12}
          className="px-2 py-2"
        >
          <Text variant="label" className="text-muted-foreground">
            Skip
          </Text>
        </PressableFade>
      </View>

      {/* Pager */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {onboardingSlides.map((slide, i) => (
          <Slide key={slide.id} slide={slide} index={i} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>

      {/* Footer */}
      <Animated.View
        entering={FadeIn.delay(240).duration(420)}
        style={{
          paddingHorizontal: screenPadding,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {/* Progress rail */}
        <View
          className="mb-7 flex-row items-center justify-center gap-2"
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${index + 1} of ${onboardingSlides.length}`}
        >
          {onboardingSlides.map((slide, i) => (
            <View
              key={slide.id}
              className="overflow-hidden"
              style={{
                height: 4,
                width: i === index ? 30 : 8,
                borderRadius: radius.full,
                backgroundColor:
                  i === index ? 'transparent' : 'rgba(255,255,255,0.16)',
              }}
            >
              {i === index && (
                <LinearGradient
                  colors={[brand.purple, brand.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          ))}
        </View>

        <Button
          label={isLast ? 'Get started' : 'Continue'}
          iconRight={isLast ? undefined : ArrowRight}
          onPress={advance}
          size="lg"
          fullWidth
        />

        {isLast && (
          <Text
            variant="caption"
            className="mt-4 text-center text-muted-foreground"
            style={{ fontFamily: fontFamily.regular }}
          >
            You can connect a wallet any time from the Home screen.
          </Text>
        )}
      </Animated.View>
    </View>
  );
}
