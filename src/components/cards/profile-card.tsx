/**
 * Compact user row — attendee lists, search results, dashboard registrations.
 */

import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { brand } from '@/theme/colors';
import { TOUCH_TARGET, radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { User } from '@/types';
import { cn } from '@/utils/cn';
import { shortenAddress } from '@/utils/format';

import { Avatar } from '../ui/avatar';
import { ChevronRight, Trophy } from '../ui/icon';
import { PressableFade } from '../ui/pressable-scale';
import { Text } from '../ui/text';

export interface ProfileCardProps {
  user: User;
  onPress?: (user: User) => void;
  /** Right-hand slot — a Follow button, status badge, etc. */
  trailing?: React.ReactNode;
  /** Show the reputation score under the handle. */
  showReputation?: boolean;
  /** Label shown instead of the bio, e.g. "Host" or a timestamp. */
  subtitle?: string;
  className?: string;
}

export const ProfileCard = memo(function ProfileCard({
  user,
  onPress,
  trailing,
  showReputation = false,
  subtitle,
  className,
}: ProfileCardProps) {
  const handlePress = useCallback(() => onPress?.(user), [onPress, user]);

  const secondary =
    subtitle ??
    (user.walletAddress ? shortenAddress(user.walletAddress) : `@${user.handle}`);

  return (
    <PressableFade
      onPress={onPress ? handlePress : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${user.name}, @${user.handle}`}
      className={cn('flex-row items-center gap-3', className)}
      style={{ minHeight: TOUCH_TARGET, paddingVertical: 8 }}
    >
      <Avatar name={user.name} seed={user.id} size="md" />

      <View className="flex-1">
        <Text variant="title" numberOfLines={1}>
          {user.name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text
            variant="caption"
            className="text-muted-foreground"
            numberOfLines={1}
            style={
              user.walletAddress && !subtitle
                ? { fontFamily: fontFamily.mono }
                : undefined
            }
          >
            {secondary}
          </Text>
          {showReputation && (
            <View className="flex-row items-center gap-1">
              <Trophy size={10} color={brand.cyan} strokeWidth={2.4} />
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 11,
                  color: brand.cyan,
                }}
              >
                {user.reputation}
              </Text>
            </View>
          )}
        </View>
      </View>

      {trailing ??
        (onPress && (
          <View
            className="items-center justify-center bg-white/[0.06]"
            style={{ width: 28, height: 28, borderRadius: radius.full }}
          >
            <ChevronRight size={14} color="#94a2b8" strokeWidth={2.4} />
          </View>
        ))}
    </PressableFade>
  );
});
