/**
 * Button - the mobile counterpart to the web app's `components/ui/button.tsx`.
 *
 * Same five variants (primary gradient, glass secondary, outline, ghost, link)
 * and the same pill geometry, rebuilt with `expo-linear-gradient` for the fill
 * and a Reanimated press spring in place of `active:scale-[0.97]`.
 *
 * All sizes clear the 44px touch-target floor.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';

import { brand, gradients } from '@/theme/colors';
import { TOUCH_TARGET, radius, shadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

import { type LucideIcon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { useThemeColors } from '@/theme/theme-provider';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before the label. */
  icon?: LucideIcon;
  /** Rendered after the label. */
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  style?: ViewStyle;
  accessibilityHint?: string;
  /** Escape hatch for bespoke content (wallet rows, chips). */
  children?: ReactNode;
}

const SIZES: Record<
  ButtonSize,
  { height: number; paddingX: number; fontSize: number; icon: number; gap: number }
> = {
  sm: { height: TOUCH_TARGET, paddingX: 16, fontSize: 13, icon: 15, gap: 6 },
  md: { height: 50, paddingX: 22, fontSize: 15, icon: 17, gap: 8 },
  lg: { height: 56, paddingX: 28, fontSize: 16, icon: 19, gap: 10 },
};

/** Foreground colour per variant - icons and label share it. */
const FOREGROUND: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: themeColors.foreground,
  outline: themeColors.foreground,
  ghost: themeColors.mutedForeground,
  link: brand.cyan,
  danger: '#fecaca',
};

const SURFACE_CLASS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'bg-white/[0.06] border border-white/10',
  outline: 'bg-white/[0.02] border border-white/15',
  ghost: 'bg-transparent',
  link: 'bg-transparent',
  danger: 'bg-red-500/10 border border-red-500/30',
};

export const Button = memo(function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  className,
  style,
  accessibilityHint,
  children,
}: ButtonProps) {
  const themeColors = useThemeColors();
  const dims = SIZES[size];
  const isDisabled = disabled || loading;
  const foreground = FOREGROUND[variant];
  const isPill = variant !== 'link';

  const content = children ?? (
    <View
      className="flex-row items-center justify-center"
      style={{ gap: dims.gap }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        Icon && <Icon size={dims.icon} color={foreground} strokeWidth={2.2} />
      )}
      <Text
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: dims.fontSize,
          color: foreground,
          textDecorationLine: variant === 'link' ? 'underline' : 'none',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {IconRight && !loading && (
        <IconRight size={dims.icon} color={foreground} strokeWidth={2.2} />
      )}
    </View>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        'items-center justify-center overflow-hidden',
        isPill && SURFACE_CLASS[variant],
        fullWidth && 'w-full',
        className,
      )}
      style={[
        {
          height: variant === 'link' ? TOUCH_TARGET : dims.height,
          paddingHorizontal: variant === 'link' ? 4 : dims.paddingX,
          borderRadius: radius.full,
        },
        variant === 'primary' && !isDisabled ? shadow.glow : null,
        style,
      ]}
    >
      {variant === 'primary' && (
        <LinearGradient
          colors={[...gradients.brand.colors]}
          locations={[...gradients.brand.locations]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
      {content}
    </PressableScale>
  );
});

/**
 * Icon-only button - a circular variant used in headers and card corners.
 * Always renders at the 44px floor regardless of the glyph size.
 */
export const IconButton = memo(function IconButton({
  icon: Icon,
  onPress,
  label,
  variant = 'secondary',
  size = TOUCH_TARGET,
  iconSize = 19,
  className,
  disabled,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  /** Screen-reader label - required, since there is no visible text. */
  label: string;
  variant?: 'secondary' | 'ghost' | 'glass';
  size?: number;
  iconSize?: number;
  className?: string;
  disabled?: boolean;
}) {
  const themeColors = useThemeColors();
  const surface =
    variant === 'ghost'
      ? 'bg-transparent'
      : variant === 'glass'
        ? 'bg-black/40 border border-white/10'
        : 'bg-white/[0.06] border border-white/10';

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn('items-center justify-center', surface, className)}
      style={{ width: size, height: size, borderRadius: radius.full }}
    >
      <Icon size={iconSize} color={themeColors.foreground} strokeWidth={2} />
    </PressableScale>
  );
});
