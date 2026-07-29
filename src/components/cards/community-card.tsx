/**
 * Community card — two shapes from one component:
 * `compact` for the Home trending rail, full-width for the Discover list.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { accents, resolveCoverGradient } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Community } from '@/types';
import { cn } from '@/utils/cn';
import { compactNumber, plural } from '@/utils/format';

import { Badge } from '../ui/badge';
import { BadgeCheck, DynamicIcon, Lock } from '../ui/icon';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

export interface CommunityCardProps {
  community: Community;
  onPress: (community: Community) => void;
  compact?: boolean;
  width?: number;
  className?: string;
}

export const CommunityCard = memo(function CommunityCard({
  community,
  onPress,
  compact = false,
  width,
  className,
}: CommunityCardProps) {
  const accent = accents[community.accent];
  const colors = resolveCoverGradient(community.coverGradient);

  const handlePress = useCallback(
    () => onPress(community),
    [community, onPress],
  );

  const label = `${community.name}, ${compactNumber(
    community.memberCount,
  )} members, ${plural(community.eventCount, 'event')}`;

  if (compact) {
    return (
      <PressableScale
        onPress={handlePress}
        scaleTo={0.96}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={cn(
          'overflow-hidden border border-white/10 bg-white/[0.035] p-4',
          className,
        )}
        style={{ borderRadius: radius['2xl'], width: width ?? 152 }}
      >
        <View
          className="items-center justify-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.lg,
            backgroundColor: `${accent}1f`,
            borderWidth: 1,
            borderColor: `${accent}38`,
          }}
        >
          <DynamicIcon
            name={community.icon}
            size={20}
            color={accent}
            strokeWidth={2}
          />
        </View>

        <View className="mt-3 flex-row items-center gap-1">
          <Text variant="title" numberOfLines={1} className="flex-shrink">
            {community.name}
          </Text>
          {community.verified && (
            <BadgeCheck size={13} color={accent} strokeWidth={2.4} />
          )}
        </View>

        <Text variant="caption" className="mt-1 text-muted-foreground">
          {compactNumber(community.memberCount)} members
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'overflow-hidden border border-white/10 bg-white/[0.035]',
        className,
      )}
      style={{ borderRadius: radius['3xl'] }}
    >
      <View style={{ height: 64 }}>
        <LinearGradient
          colors={[colors[0], colors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0, opacity: 0.85 }}
        />
      </View>

      <View className="p-4 pt-0">
        <View
          className="items-center justify-center border-2 border-brand-bg"
          style={{
            width: 54,
            height: 54,
            borderRadius: radius.xl,
            backgroundColor: '#0b1024',
            marginTop: -27,
          }}
        >
          <DynamicIcon
            name={community.icon}
            size={24}
            color={accent}
            strokeWidth={2}
          />
        </View>

        <View className="mt-3 flex-row items-center gap-1.5">
          <Text variant="h3" numberOfLines={1} className="flex-shrink">
            {community.name}
          </Text>
          {community.verified && (
            <BadgeCheck size={16} color={accent} strokeWidth={2.4} />
          )}
          {community.tokenGated && (
            <Badge label="Gated" variant="purple" size="sm" icon={Lock} />
          )}
        </View>

        <Text
          variant="bodySm"
          className="mt-1.5 text-muted-foreground"
          numberOfLines={2}
        >
          {community.description}
        </Text>

        <View className="mt-3.5 flex-row items-center gap-4">
          <View className="flex-row items-baseline gap-1">
            <Text style={{ fontFamily: fontFamily.semibold, fontSize: 14 }}>
              {compactNumber(community.memberCount)}
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              members
            </Text>
          </View>
          <View className="flex-row items-baseline gap-1">
            <Text style={{ fontFamily: fontFamily.semibold, fontSize: 14 }}>
              {community.eventCount}
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              events
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});
