/**
 * Gradient-initial avatar.
 *
 * Deterministic: the same seed always yields the same gradient, matching the
 * web app's `lib/avatar.ts` so a user looks identical across platforms.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';

import { resolveCoverGradient } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import { avatarGradient, initials } from '@/utils/avatar';
import { cn } from '@/utils/cn';

import { Text } from './text';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
};

export interface AvatarProps {
  name: string;
  /** Defaults to `name`; pass a user id for stability across renames. */
  seed?: string;
  size?: AvatarSize | number;
  /** Ring drawn around the avatar - used for hosts and the profile header. */
  ring?: boolean;
  /**
   * A real picture, when there is one.
   *
   * The gradient-initial is still rendered underneath rather than replaced: it
   * is what shows while the image loads, and what remains if the URL 404s. A
   * broken avatar should look like a person, not like a hole.
   */
  uri?: string | null;
  className?: string;
  style?: ViewStyle;
}

export const Avatar = memo(function Avatar({
  name,
  seed,
  size = 'md',
  ring = false,
  uri,
  className,
  style,
}: AvatarProps) {
  const dimension = typeof size === 'number' ? size : SIZES[size];
  const colors = resolveCoverGradient(avatarGradient(seed ?? name));

  return (
    <View
      className={cn('items-center justify-center overflow-hidden', className)}
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        },
        ring
          ? { borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' }
          : null,
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}'s avatar`}
    >
      <LinearGradient
        colors={[colors[0], colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Text
        style={{
          fontFamily: fontFamily.bold,
          fontSize: dimension * 0.38,
          color: '#ffffff',
          letterSpacing: 0.5,
        }}
      >
        {initials(name)}
      </Text>

      {/* Drawn over the initials, so the gradient is the placeholder and the
          fallback in one - no separate loading state to manage. */}
      {uri ? (
        <Image
          source={{ uri }}
          contentFit="cover"
          transition={180}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
});

/**
 * Overlapping avatar stack for attendee lists.
 * Shows up to `max` faces, then a "+N" counter.
 */
export const AvatarStack = memo(function AvatarStack({
  users,
  max = 4,
  size = 28,
  total,
}: {
  users: { id: string; name: string }[];
  max?: number;
  size?: number;
  /** Full attendee count when `users` is only a preview slice. */
  total?: number;
}) {
  const visible = users.slice(0, max);
  const overflow = (total ?? users.length) - visible.length;

  return (
    <View
      className="flex-row items-center"
      accessible
      accessibilityLabel={`${total ?? users.length} attending`}
    >
      {visible.map((user, index) => (
        <View
          key={user.id}
          style={{
            marginLeft: index === 0 ? 0 : -size * 0.32,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: '#050816',
          }}
        >
          <Avatar name={user.name} seed={user.id} size={size} />
        </View>
      ))}
      {overflow > 0 && (
        <View
          className="items-center justify-center border-2 border-brand-bg bg-white/10"
          style={{
            marginLeft: -size * 0.32,
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        >
          <Text
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: size * 0.32,
              color: '#94a2b8',
            }}
          >
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
});
