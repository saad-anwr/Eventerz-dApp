/**
 * Ticket detail — the screen you hold up at the door.
 *
 * The QR is the point, so it gets a bright card with maximum contrast; the
 * chain metadata sits below for anyone who wants to verify the asset.
 */

import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Copy,
  ExternalLink,
  Globe,
  Lock,
  MapPin,
  Share2,
} from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useEvent } from '@/hooks/use-events';
import { useTicket } from '@/hooks/use-tickets';
import { toast } from '@/store/toast-store';
import { brand, resolveCoverGradient } from '@/theme/colors';
import { radius, screenPadding, shadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import {
  formatEventDateLong,
  formatEventTimeRange,
  fullTimestamp,
  shortenAddress,
} from '@/utils/format';
import { haptics } from '@/utils/haptics';

const QR_SIZE = 230;

function MetaLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-3">
      <Text variant="bodySm" className="text-muted-foreground">
        {label}
      </Text>
      <Text
        variant="bodySm"
        numberOfLines={1}
        style={{
          fontFamily: mono ? fontFamily.mono : fontFamily.medium,
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: ticket, isLoading, isError, refetch } = useTicket(id);
  const { data: event } = useEvent(ticket?.eventId);

  const copyAsset = useCallback(async () => {
    if (!ticket) return;
    haptics.success();
    await Clipboard.setStringAsync(ticket.assetId);
    toast.success('Asset ID copied');
  }, [ticket]);

  if (isLoading) return <ScreenLoader label="Loading ticket" />;

  if (isError || !ticket || !event) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ErrorState
            title="Ticket not found"
            description="This ticket may have been transferred or burned."
            onRetry={() => refetch()}
          />
        </View>
      </Screen>
    );
  }

  const colors = resolveCoverGradient(event.coverGradient);
  const used = ticket.status === 'used';

  return (
    <Screen edgeTop={false} aurora={false}>
      {/* Gradient wash matching the event */}
      <LinearGradient
        colors={[colors[0], colors[1], '#050816']}
        locations={[0, 0.35, 0.85]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={{ position: 'absolute', inset: 0, opacity: 0.28 }}
      />

      {/* Header */}
      <View
        className="flex-row items-center justify-between"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          variant="glass"
          size={40}
          iconSize={18}
        />
        <IconButton
          icon={Share2}
          label="Share ticket"
          onPress={() => toast.info('Sharing coming soon')}
          variant="glass"
          size={40}
          iconSize={18}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingBottom: insets.bottom + 32,
          paddingTop: 12,
        }}
      >
        {/* Status */}
        <Animated.View
          entering={FadeIn.duration(360)}
          className="flex-row justify-center gap-2"
        >
          {used ? (
            <Badge label="Checked in" variant="green" icon={BadgeCheck} />
          ) : (
            <Badge label="Valid ticket" variant="cyan" dot />
          )}
          {ticket.soulbound && (
            <Badge label="Soulbound" variant="purple" icon={Lock} />
          )}
        </Animated.View>

        {/* QR card */}
        <Animated.View
          entering={ZoomIn.delay(80).duration(420)}
          className="mt-5 items-center bg-white p-6"
          style={[{ borderRadius: radius['4xl'] }, shadow.card]}
        >
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Check-in QR code for ${event.title}, ticket number ${ticket.serial}`}
            style={{ opacity: used ? 0.35 : 1 }}
          >
            <QRCode
              value={ticket.qrPayload}
              size={QR_SIZE}
              backgroundColor="#ffffff"
              color="#050816"
              ecl="M"
            />
          </View>

          {used && (
            <View className="absolute inset-0 items-center justify-center">
              <View
                className="flex-row items-center gap-2 px-4 py-2.5"
                style={{
                  borderRadius: radius.full,
                  backgroundColor: brand.green,
                }}
              >
                <BadgeCheck size={17} color="#050816" strokeWidth={2.6} />
                <Text
                  style={{
                    fontFamily: fontFamily.bold,
                    fontSize: 14,
                    color: '#050816',
                  }}
                >
                  CHECKED IN
                </Text>
              </View>
            </View>
          )}

          <Text
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 13,
              color: '#050816',
              marginTop: 18,
              letterSpacing: 1,
            }}
          >
            #{String(ticket.serial).padStart(4, '0')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 11,
              color: '#64748b',
              marginTop: 3,
            }}
          >
            {ticket.tier.toUpperCase()}
          </Text>
        </Animated.View>

        {/* Event */}
        <Animated.View entering={FadeInDown.delay(160).duration(420)} className="mt-6">
          <Text variant="h2" numberOfLines={2}>
            {event.title}
          </Text>

          <View className="mt-3.5 gap-2.5">
            <View className="flex-row items-center gap-2.5">
              <Calendar size={15} color={brand.cyan} strokeWidth={2.1} />
              <Text variant="bodySm" className="text-muted-foreground">
                {formatEventDateLong(event.startsAt)} ·{' '}
                {formatEventTimeRange(event.startsAt, event.endsAt)}
              </Text>
            </View>
            <View className="flex-row items-center gap-2.5">
              {event.isOnline ? (
                <Globe size={15} color={brand.cyan} strokeWidth={2.1} />
              ) : (
                <MapPin size={15} color={brand.cyan} strokeWidth={2.1} />
              )}
              <Text variant="bodySm" className="text-muted-foreground">
                {event.location}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* On-chain metadata */}
        <Animated.View
          entering={FadeInDown.delay(220).duration(420)}
          className="mt-6 border border-white/10 bg-white/[0.03] px-4"
          style={{ borderRadius: radius['2xl'] }}
        >
          <MetaLine label="Standard" value="Compressed NFT (cNFT)" />
          <View className="h-px bg-white/[0.06]" />
          <MetaLine label="Asset ID" value={shortenAddress(ticket.assetId, 8)} mono />
          <View className="h-px bg-white/[0.06]" />
          <MetaLine label="Minted" value={fullTimestamp(ticket.mintedAt)} />
          {ticket.checkedInAt && (
            <>
              <View className="h-px bg-white/[0.06]" />
              <MetaLine
                label="Checked in"
                value={fullTimestamp(ticket.checkedInAt)}
              />
            </>
          )}
          <View className="h-px bg-white/[0.06]" />
          <MetaLine
            label="Transferable"
            value={ticket.soulbound ? 'No — soulbound' : 'Yes'}
          />
        </Animated.View>

        {/* Actions */}
        <Animated.View
          entering={FadeInDown.delay(280).duration(420)}
          className="mt-5 gap-3"
        >
          <Button
            label="Copy asset ID"
            icon={Copy}
            variant="secondary"
            onPress={copyAsset}
            fullWidth
          />
          <Button
            label="View event"
            icon={ExternalLink}
            variant="outline"
            onPress={() => router.push(`/event/${event.id}`)}
            fullWidth
          />
        </Animated.View>

        <Text
          variant="caption"
          className="mt-6 text-center text-muted-foreground"
        >
          Show this code at the door. Check-in writes attendance on-chain and
          drops your Proof-of-Attendance badge.
        </Text>
      </ScrollView>
    </Screen>
  );
}
