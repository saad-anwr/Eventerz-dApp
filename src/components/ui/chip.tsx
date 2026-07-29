/**
 * Selectable tag chip — the interactive sibling of `<Badge>`.
 * Used for category filters, interest tags and the Create wizard's tag picker.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { brand } from '@/theme/colors';
import { TOUCH_TARGET, radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';
import { haptics } from '@/utils/haptics';

import { type LucideIcon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
  className?: string;
}

export const Chip = memo(function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  count,
  disabled,
  className,
}: ChipProps) {
  const color = selected ? '#ffffff' : '#94a2b8';

  return (
    <PressableScale
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      disabled={disabled}
      scaleTo={0.94}
      hapticFeedback={false}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      className={cn(
        'flex-row items-center border',
        selected
          ? 'border-brand-purple/60 bg-brand-purple/20'
          : 'border-white/10 bg-white/[0.04]',
        className,
      )}
      style={{
        borderRadius: radius.full,
        paddingHorizontal: 14,
        height: 38,
        minWidth: TOUCH_TARGET,
        gap: 6,
      }}
    >
      {Icon && <Icon size={13} color={color} strokeWidth={2.2} />}
      <Text
        style={{
          fontFamily: selected ? fontFamily.semibold : fontFamily.medium,
          fontSize: 13,
          color,
        }}
      >
        {label}
      </Text>
      {count !== undefined && (
        <View
          className={cn(
            'items-center justify-center px-1.5',
            selected ? 'bg-white/20' : 'bg-white/10',
          )}
          style={{ borderRadius: radius.full, minWidth: 20, height: 18 }}
        >
          <Text
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 10,
              color: selected ? '#ffffff' : brand.cyan,
            }}
          >
            {count}
          </Text>
        </View>
      )}
    </PressableScale>
  );
});
