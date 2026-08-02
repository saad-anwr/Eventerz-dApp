/**
 * Gesture-driven bottom sheet.
 *
 * Built directly on Reanimated + Gesture Handler rather than pulling in a
 * sheet library: the app needs one behaviour (drag down to dismiss, spring
 * back above the threshold) and this keeps the dependency surface small and
 * the animation fully on the UI thread.
 *
 * The drag runs as a worklet, so dragging stays at 60fps even while a query is
 * resolving on the JS thread.
 */

import { BlurView } from 'expo-blur';
import { memo, useCallback, useEffect, type ReactNode } from 'react';
import {
  BackHandler,
  Dimensions,
  Platform,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useOverlayStore } from '@/store/overlay-store';
import { motion, radius } from '@/theme/layout';
import { cn } from '@/utils/cn';
import { haptics } from '@/utils/haptics';

import { IconButton } from './button';
import { X } from './icon';
import { Text } from './text';
import { useThemeColors } from '@/theme/theme-provider';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Drag distance past which release dismisses instead of springing back. */
const DISMISS_THRESHOLD = 110;
/** Fling velocity that dismisses regardless of distance. */
const DISMISS_VELOCITY = 900;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Fraction of screen height the sheet may occupy. */
  maxHeightRatio?: number;
  showHandle?: boolean;
  showCloseButton?: boolean;
  className?: string;
  contentStyle?: ViewStyle;
}

export const BottomSheet = memo(function BottomSheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  maxHeightRatio = 0.85,
  showHandle = true,
  showCloseButton = true,
  className,
  contentStyle,
}: BottomSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // `translateY` is the sheet offset; `progress` drives the backdrop fade.
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const progress = useSharedValue(0);

  const close = useCallback(() => {
    haptics.light();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, motion.spring.snappy);
      progress.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = reduceMotion
        ? SCREEN_HEIGHT
        : withTiming(SCREEN_HEIGHT, {
            duration: motion.duration.fast,
            easing: Easing.bezier(...motion.easing.exit),
          });
      progress.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, progress, reduceMotion]);

  /*
   * Take the tab bar out while the sheet is up.
   *
   * The sheet cannot be drawn above it - see `overlay-store` for why - and a
   * modal surface should not leave the navigation underneath it live anyway.
   * Registered here rather than at each call site so every sheet gets it.
   */
  useEffect(() => {
    if (!visible) return;
    const { open, close: release } = useOverlayStore.getState();
    open();
    return release;
  }, [visible]);

  // Android hardware back should close the sheet, not the screen behind it.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, close]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only track downward drags - upward should feel like a hard stop.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > DISMISS_THRESHOLD ||
        event.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, motion.spring.snappy);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  if (!visible) return null;

  return (
    <View
      className="absolute inset-0 justify-end"
      style={{ zIndex: 100 }}
      accessibilityViewIsModal
    >
      {/* Backdrop */}
      <Animated.View
        style={[{ position: 'absolute', inset: 0 }, backdropStyle]}
      >
        <Animated.View
          className="flex-1 bg-black/75"
          onTouchEnd={close}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              maxHeight: SCREEN_HEIGHT * maxHeightRatio,
              borderTopLeftRadius: radius['4xl'],
              borderTopRightRadius: radius['4xl'],
              overflow: 'hidden',
            },
            sheetStyle,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={40}
              tint="dark"
              style={{ position: 'absolute', inset: 0 }}
            />
          ) : null}

          {/*
            Fully opaque, not /98. At 98% the aurora background and whatever
            text sits behind the sheet bleed faintly through the surface, which
            reads as overlapping content rather than a deliberate translucency.
          */}
          <View
            className={cn('border-t border-white/10', className)}
            style={[
              {
                backgroundColor: themeColors.card,
                paddingBottom: insets.bottom + 16,
              },
              contentStyle,
            ]}
          >
            {showHandle && (
              <View className="items-center pb-2 pt-3">
                <View className="h-1 w-10 rounded-full bg-white/25" />
              </View>
            )}

            {(title || showCloseButton) && (
              <View className="flex-row items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-1">
                <View className="flex-1">
                  {title && (
                    <Text variant="h3" accessibilityRole="header">
                      {title}
                    </Text>
                  )}
                  {subtitle && (
                    <Text
                      variant="bodySm"
                      className="mt-1 text-muted-foreground"
                    >
                      {subtitle}
                    </Text>
                  )}
                </View>
                {showCloseButton && (
                  <IconButton
                    icon={X}
                    label="Close"
                    onPress={close}
                    variant="ghost"
                    size={32}
                    iconSize={17}
                  />
                )}
              </View>
            )}

            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});
