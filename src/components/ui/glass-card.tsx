/**
 * Glass surface - the mobile equivalent of the web app's `.glass` and
 * `.gradient-border` utilities.
 *
 * `expo-blur` supplies the backdrop-filter; a hairline border and an inner
 * highlight reproduce the `inner-glow` shadow. The `gradientBorder` variant
 * paints the violet->cyan rim the web app draws with a masked pseudo-element.
 */

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

import { radius as radii, shadow } from '@/theme/layout';
import { cn } from '@/utils/cn';

export interface GlassCardProps {
  children: ReactNode;
  /** Higher = more opaque glass. */
  intensity?: number;
  className?: string;
  style?: ViewStyle;
  radius?: number;
  /** Draw the violet->cyan gradient rim. */
  gradientBorder?: boolean;
  /** Drop the drop-shadow (useful inside scroll rails). */
  flat?: boolean;
}

export const GlassCard = memo(function GlassCard({
  children,
  intensity = 24,
  className,
  style,
  radius = radii['3xl'],
  gradientBorder = false,
  flat = false,
}: GlassCardProps) {
  return (
    <View
      className={cn('overflow-hidden', className)}
      style={[
        { borderRadius: radius },
        flat ? null : shadow.card,
        style,
      ]}
    >
      {/*
        Android's BlurView is expensive and renders inconsistently below API 31,
        so we use a translucent fill there and reserve the real blur for iOS.
      */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint="dark"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : (
        <View
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(20,26,46,0.72)' }}
        />
      )}

      {gradientBorder && (
        <LinearGradient
          colors={[
            'rgba(153,69,255,0.50)',
            'rgba(47,128,255,0.15)',
            'rgba(34,211,238,0.35)',
          ]}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
          }}
        />
      )}

      {/* Inner surface - inset by 1px when a gradient rim is showing. */}
      <View
        className={cn(
          gradientBorder ? 'bg-[#0b1024]' : 'border border-white/10',
        )}
        style={{
          /*
           * `flexGrow`/`flexShrink` with an **auto** basis, not `flex-1`.
           *
           * # The bug this fixes
           *
           * This was `flex-1`, which compiles to `flexBasis: '0%'`. A
           * percentage basis is resolved against the parent's main-axis size,
           * and what that means depends entirely on whether the parent is
           * bounded:
           *
           *  - Inside a `ScrollView`, the content height is unbounded, so the
           *    percentage resolves to *undefined*, Yoga falls back to `auto`,
           *    and the card is sized by its content. This is why every card in
           *    a scrolling list looked correct.
           *
           *  - Inside a bounded parent - `absolute inset-0` with
           *    `justify-center`, which is exactly how `Modal` centres its card -
           *    the percentage resolves against a real number. `0%` of the screen
           *    height is **0**, a definite size, so the surface collapsed to
           *    nothing and `overflow-hidden` clipped the content away.
           *
           * The card did not disappear: the outer view still painted its
           * `gradientBorder`, so every dialog in the app rendered as a scrim
           * over a dimmed screen with a 1px gradient line across the middle and
           * no body. The confirmation buttons existed and were unreachable, and
           * "Disconnect wallet?" - which sets `dismissOnBackdrop={false}` -
           * could not be dismissed by tapping outside it either. The only way
           * out was the back gesture, so a wallet could not be disconnected at
           * all.
           *
           * An `auto` basis is content-sized in both cases and still grows to
           * fill a parent that has room to give, which is what this view wanted
           * in the first place.
           */
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 'auto',
          borderRadius: gradientBorder ? radius - 1 : radius,
          margin: gradientBorder ? 1 : 0,
        }}
      >
        {children}
      </View>
    </View>
  );
});

/**
 * Lightweight glass - no blur, no shadow. Use inside lists where dozens are on
 * screen at once and a real blur per row would cost frames.
 */
export const SolidCard = memo(function SolidCard({
  children,
  className,
  style,
  radius = radii['3xl'],
}: {
  children: ReactNode;
  className?: string;
  style?: ViewStyle;
  radius?: number;
}) {
  return (
    <View
      className={cn(
        'overflow-hidden border border-white/10 bg-white/[0.035]',
        className,
      )}
      style={[{ borderRadius: radius }, style]}
    >
      {children}
    </View>
  );
});
