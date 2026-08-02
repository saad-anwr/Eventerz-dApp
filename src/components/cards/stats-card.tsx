/**
 * Metric tile for the organizer dashboard and profile.
 * Uses `<AnimatedCounter>` so numbers count up when the screen mounts.
 */

import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';

import { accents, type AccentKey } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

import { AnimatedCounter } from '../ui/animated-counter';
import { TrendingUp, type LucideIcon } from '../ui/icon';
import { Text } from '../ui/text';
import { useThemeColors } from '@/theme/theme-provider';

export interface StatsCardProps {
  label: string;
  value: number;
  icon?: LucideIcon;
  accent?: AccentKey;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
  /** Period-over-period change, e.g. "+34%". */
  delta?: string;
  className?: string;
  style?: ViewStyle;
}

export const StatsCard = memo(function StatsCard({
  label,
  value,
  icon: Icon,
  accent = 'purple',
  prefix,
  suffix,
  decimals = 0,
  compact = false,
  delta,
  className,
  style,
}: StatsCardProps) {
  const themeColors = useThemeColors();
  const color = accents[accent];
  const positive = !delta || !delta.startsWith('-');

  return (
    <View
      className={cn(
        'border border-white/10 bg-white/[0.035] p-4',
        className,
      )}
      style={[{ borderRadius: radius['2xl'] }, style]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${label}: ${prefix ?? ''}${value}${suffix ?? ''}${
        delta ? `, ${delta} change` : ''
      }`}
    >
      <View className="flex-row items-center justify-between">
        {Icon && (
          <View
            className="items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.md,
              backgroundColor: `${color}1f`,
            }}
          >
            <Icon size={16} color={color} strokeWidth={2.2} />
          </View>
        )}

        {delta && (
          <View
            className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              backgroundColor: positive
                ? 'rgba(20,241,149,0.12)'
                : 'rgba(248,113,113,0.12)',
            }}
          >
            <TrendingUp
              size={10}
              color={positive ? '#14f195' : '#f87171'}
              strokeWidth={2.6}
              style={
                positive ? undefined : { transform: [{ scaleY: -1 }] }
              }
            />
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: 10,
                color: positive ? '#14f195' : '#f87171',
              }}
            >
              {delta}
            </Text>
          </View>
        )}
      </View>

      <AnimatedCounter
        value={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        compact={compact}
        className="mt-3"
        style={{ fontSize: 24, color: themeColors.foreground }}
      />

      <Text variant="caption" className="mt-0.5 text-muted-foreground">
        {label}
      </Text>
    </View>
  );
});
