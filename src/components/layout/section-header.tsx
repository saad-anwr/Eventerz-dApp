/**
 * Section heading with an optional "See all" affordance — the rail header used
 * across Home, Profile and the dashboard.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { brand } from '@/theme/colors';
import { screenPadding } from '@/theme/layout';
import { cn } from '@/utils/cn';

import { ChevronRight, type LucideIcon } from '../ui/icon';
import { PressableFade } from '../ui/pressable-scale';
import { Text } from '../ui/text';

export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  actionLabel = 'See all',
  onAction,
  icon: Icon,
  className,
  padded = true,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  className?: string;
  /** Apply the standard screen gutter. */
  padded?: boolean;
}) {
  return (
    <View
      className={cn('flex-row items-end justify-between gap-3', className)}
      style={{ paddingHorizontal: padded ? screenPadding : 0 }}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {Icon && <Icon size={16} color={brand.cyan} strokeWidth={2.3} />}
          <Text variant="h3" accessibilityRole="header">
            {title}
          </Text>
        </View>
        {subtitle && (
          <Text variant="caption" className="mt-1 text-muted-foreground">
            {subtitle}
          </Text>
        )}
      </View>

      {onAction && (
        <PressableFade
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={10}
          className="flex-row items-center gap-0.5"
        >
          <Text variant="label" style={{ color: brand.cyan }}>
            {actionLabel}
          </Text>
          <ChevronRight size={14} color={brand.cyan} strokeWidth={2.4} />
        </PressableFade>
      )}
    </View>
  );
});
