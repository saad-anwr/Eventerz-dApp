/**
 * Centred modal - the web app's `wallet-modal` treatment: scrim, gradient-rim
 * card, scale-and-lift entrance.
 *
 * Use `<BottomSheet>` for anything list-shaped; this is for confirmations and
 * short-form dialogs where centring reads better.
 */

import { memo, useEffect, type ReactNode } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useOverlayStore } from '@/store/overlay-store';
import { motion, radius } from '@/theme/layout';
import { cn } from '@/utils/cn';

import { IconButton } from './button';
import { GlassCard } from './glass-card';
import { X } from './icon';
import { Text } from './text';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showCloseButton?: boolean;
  /** Tapping the scrim dismisses. Off for destructive confirmations. */
  dismissOnBackdrop?: boolean;
  className?: string;
}

export const Modal = memo(function Modal({
  visible,
  onClose,
  children,
  title,
  subtitle,
  showCloseButton = true,
  dismissOnBackdrop = true,
  className,
}: ModalProps) {
  const scale = useSharedValue(0.94);
  const lift = useSharedValue(24);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      scale.value = 1;
      lift.value = 0;
      return;
    }
    scale.value = withSpring(1, motion.spring.snappy);
    lift.value = withSpring(0, motion.spring.snappy);
  }, [visible, scale, lift, reduceMotion]);

  /*
   * Hide the tab bar for the duration. A dialog that leaves the tabs live
   * underneath it is not a confirmation - you can simply walk away from the
   * question. See `overlay-store`.
   */
  useEffect(() => {
    if (!visible) return;
    const { open, close } = useOverlayStore.getState();
    open();
    return close;
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onClose]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
  }));

  useEffect(() => {
    if (visible) return;
    // Reset so the next open animates from the start rather than snapping.
    scale.value = withTiming(0.94, { duration: 0 });
    lift.value = withTiming(24, { duration: 0 });
  }, [visible, scale, lift]);

  if (!visible) return null;

  return (
    <View
      className="absolute inset-0 items-center justify-center px-6"
      style={{ zIndex: 110 }}
      accessibilityViewIsModal
    >
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0 bg-black/70"
        onTouchEnd={dismissOnBackdrop ? onClose : undefined}
      />

      <Animated.View style={[{ width: '100%', maxWidth: 420 }, cardStyle]}>
        <GlassCard gradientBorder radius={radius['3xl']} className={className}>
          {(title || showCloseButton) && (
            <View className="flex-row items-start justify-between gap-4 border-b border-white/10 p-5">
              <View className="flex-1">
                {title && (
                  <Text variant="h3" accessibilityRole="header">
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text variant="bodySm" className="mt-1 text-muted-foreground">
                    {subtitle}
                  </Text>
                )}
              </View>
              {showCloseButton && (
                <IconButton
                  icon={X}
                  label="Close"
                  onPress={onClose}
                  variant="ghost"
                  size={32}
                  iconSize={17}
                />
              )}
            </View>
          )}
          <View className={cn(title ? 'p-5' : 'p-6')}>{children}</View>
        </GlassCard>
      </Animated.View>
    </View>
  );
});
