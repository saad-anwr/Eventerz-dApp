/**
 * NFT ticket card.
 *
 * Shaped like a real ticket: gradient stub, a perforated divider with notches
 * punched into both edges, and a monospace asset id - the detail that sells it
 * as an on-chain object rather than a database row.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { useEvent } from '@/hooks/use-events';
import { brand, resolveCoverGradient } from '@/theme/colors';
import { radius, shadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Ticket } from '@/types';
import { cn } from '@/utils/cn';
import { eventDateParts, formatEventDate, shortenAddress } from '@/utils/format';

import { Badge } from '../ui/badge';
import { BadgeCheck, Globe, Lock, MapPin, QrCode } from '../ui/icon';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

/** Punched-out semicircle sitting on the card edge at the perforation line. */
function Notch({ side }: { side: 'left' | 'right' }) {
  return (
    <View
      className="absolute bg-brand-bg"
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        top: -10,
        [side]: -10,
      }}
    />
  );
}

export interface NftTicketCardProps {
  ticket: Ticket;
  onPress: (ticket: Ticket) => void;
  className?: string;
}

export const NftTicketCard = memo(function NftTicketCard({
  ticket,
  onPress,
  className,
}: NftTicketCardProps) {
  const { data: event } = useEvent(ticket.eventId);
  const colors = resolveCoverGradient(event?.coverGradient ?? 'purple-blue');
  const used = ticket.status === 'used';

  const handlePress = useCallback(() => onPress(ticket), [onPress, ticket]);

  if (!event) {
    return (
      <View
        className="border border-white/10 bg-white/[0.03]"
        style={{ height: 190, borderRadius: radius['3xl'] }}
      />
    );
  }

  const { month, day } = eventDateParts(event.startsAt);

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityLabel={`Ticket for ${event.title}, serial ${ticket.serial}, ${
        used ? 'checked in' : 'valid'
      }`}
      accessibilityHint="Opens the ticket and its QR code"
      className={cn('overflow-hidden', className)}
      style={[
        { borderRadius: radius['3xl'], opacity: used ? 0.72 : 1 },
        shadow.card,
      ]}
    >
      {/* Stub */}
      <View style={{ height: 108 }}>
        <LinearGradient
          colors={[colors[0], colors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.28)', 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />

        <View className="flex-row items-start justify-between p-4">
          <View className="items-center rounded-xl bg-black/40 px-2.5 py-1">
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: 9,
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 0.6,
              }}
            >
              {month}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.bold,
                fontSize: 15,
                lineHeight: 17,
                color: '#ffffff',
              }}
            >
              {day}
            </Text>
          </View>

          <View className="items-end gap-1.5">
            {used ? (
              <Badge label="Checked in" variant="green" size="sm" icon={BadgeCheck} />
            ) : (
              <Badge label="Valid" variant="cyan" size="sm" />
            )}
            {ticket.soulbound && (
              <Badge label="Soulbound" variant="purple" size="sm" icon={Lock} />
            )}
          </View>
        </View>

        <View className="mt-auto px-4 pb-3">
          <Text variant="title" numberOfLines={1} style={{ color: '#ffffff' }}>
            {event.title}
          </Text>
        </View>
      </View>

      {/* Perforation */}
      <View className="relative">
        <Notch side="left" />
        <Notch side="right" />
        <View
          className="mx-5 border-t border-dashed border-white/20"
          style={{ marginTop: 0 }}
        />
      </View>

      {/* Body */}
      <View className="bg-[#0b1024] p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text variant="caption" style={{ color: brand.cyan }}>
              {formatEventDate(event.startsAt)}
            </Text>
            <View className="mt-1.5 flex-row items-center gap-1">
              {event.isOnline ? (
                <Globe size={12} color="#94a2b8" strokeWidth={2} />
              ) : (
                <MapPin size={12} color="#94a2b8" strokeWidth={2} />
              )}
              <Text
                variant="caption"
                className="flex-1 text-muted-foreground"
                numberOfLines={1}
              >
                {event.location}
              </Text>
            </View>
          </View>

          <View
            className="items-center justify-center border border-white/10 bg-white/[0.06]"
            style={{ width: 46, height: 46, borderRadius: radius.md }}
          >
            <QrCode size={22} color="#f8fafc" strokeWidth={1.8} />
          </View>
        </View>

        <View className="mt-3.5 flex-row items-center justify-between border-t border-white/[0.07] pt-3">
          <View>
            <Text variant="micro" className="text-muted-foreground">
              TICKET
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 12,
                color: '#f8fafc',
                marginTop: 2,
              }}
            >
              #{String(ticket.serial).padStart(4, '0')}
            </Text>
          </View>

          <View className="items-end">
            <Text variant="micro" className="text-muted-foreground">
              cNFT ASSET
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 12,
                color: '#94a2b8',
                marginTop: 2,
              }}
            >
              {shortenAddress(ticket.assetId, 6)}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});
