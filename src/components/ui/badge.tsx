/**
 * Badge / pill — port of the web app's `components/ui/badge.tsx`, same variants
 * and the same tinted-border-on-tinted-fill treatment.
 */

import { memo, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

import { type LucideIcon } from './icon';
import { Text } from './text';

export type BadgeVariant =
  | 'default'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'live'
  | 'warning'
  | 'danger';

const SURFACE: Record<BadgeVariant, string> = {
  default: 'border-white/10 bg-white/[0.05]',
  purple: 'border-brand-purple/30 bg-brand-purple/10',
  blue: 'border-brand-blue/30 bg-brand-blue/10',
  cyan: 'border-brand-cyan/30 bg-brand-cyan/10',
  green: 'border-brand-green/30 bg-brand-green/10',
  live: 'border-brand-green/40 bg-brand-green/10',
  warning: 'border-amber-400/30 bg-amber-400/10',
  danger: 'border-red-400/30 bg-red-400/10',
};

const FOREGROUND: Record<BadgeVariant, string> = {
  default: '#94a2b8',
  purple: brand.purple,
  blue: brand.blue,
  cyan: brand.cyan,
  green: brand.green,
  live: brand.green,
  warning: '#fbbf24',
  danger: '#f87171',
};

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: LucideIcon;
  /** Pulsing dot for "Live now" states. */
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: ViewStyle;
  children?: ReactNode;
}

export const Badge = memo(function Badge({
  label,
  variant = 'default',
  icon: Icon,
  dot = false,
  size = 'md',
  className,
  style,
}: BadgeProps) {
  const color = FOREGROUND[variant];
  const compact = size === 'sm';

  return (
    <View
      className={cn(
        'flex-row items-center border',
        SURFACE[variant],
        className,
      )}
      style={[
        {
          borderRadius: radius.full,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 3 : 5,
          gap: 5,
        },
        style,
      ]}
      accessible
      accessibilityLabel={label}
    >
      {dot && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      )}
      {Icon && <Icon size={compact ? 10 : 12} color={color} strokeWidth={2.4} />}
      <Text
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: compact ? 10 : 11,
          lineHeight: compact ? 13 : 15,
          color,
        }}
      >
        {label}
      </Text>
    </View>
  );
});
