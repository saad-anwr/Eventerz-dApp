/**
 * Event details.
 *
 * Full-bleed gradient hero that collapses into a blurred header as you scroll,
 * then animated sections: meta, host, NFT ticket preview, community, attendees,
 * schedule, description. A sticky RSVP bar sits above the safe area.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Share, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileCard } from '@/components/cards/profile-card';
import { AnimatedHeader } from '@/components/layout/animated-header';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import {
  BadgeCheck,
  Calendar,
  Check,
  Clock,
  Globe,
  Lock,
  MapPin,
  Share2,
  Ticket,
  Users,
  DynamicIcon,
} from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import { useCommunity } from '@/hooks/use-communities';
import { useEvent, useToggleRsvp } from '@/hooks/use-events';
import { useTicketForEvent } from '@/hooks/use-tickets';
import { useUser, useUsers } from '@/hooks/use-users';
import { AnalyticsEvent, analytics } from '@/services/analytics-service';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand, resolveCoverGradient } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { siteConfig } from '@/constants/config';
import type { User } from '@/types';
import {
  countdownLabel,
  fillPercent,
  formatEventDateLong,
  formatEventTimeRange,
  plural,
} from '@/utils/format';
import { haptics } from '@/utils/haptics';

const HERO_HEIGHT = 300;

/** Titled block with a staggered entrance. */
function Section({
  title,
  children,
  delay = 0,
}: {
  title?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420)}
      className="mt-7"
      style={{ paddingHorizontal: screenPadding }}
    >
      {title && (
        <Text variant="h3" className="mb-3" accessibilityRole="header">
          {title}
        </Text>
      )}
      {children}
    </Animated.View>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  accent = '#94a2b8',
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View
        className="items-center justify-center bg-white/[0.06]"
        style={{ width: 38, height: 38, borderRadius: radius.md }}
      >
        <Icon size={17} color={accent} strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text variant="caption" className="text-muted-foreground">
          {label}
        </Text>
        <Text variant="bodySm" style={{ fontFamily: fontFamily.medium }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const { sheetVisible, requireWallet, closeSheet, handleConnected } =
    useConnectWallet();

  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const { data: host } = useUser(event?.hostId);
  const { data: community } = useCommunity(event?.communityId);
  const { data: ticket } = useTicketForEvent(id);
  const currentUser = useWalletStore((s) => s.user);

  const attendeePreview = useMemo(
    () => event?.attendeeIds.slice(0, 8) ?? [],
    [event?.attendeeIds],
  );
  const { data: attendees = [] } = useUsers(attendeePreview);

  const toggleRsvp = useToggleRsvp();

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Hero scales up when over-scrolled and drifts on the way out.
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          scrollY.value,
          [-200, 0],
          [1.4, 1],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          scrollY.value,
          [0, HERO_HEIGHT],
          [0, HERO_HEIGHT * 0.35],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const handleShare = useCallback(() => {
    if (!event) return;
    haptics.light();
    Share.share({
      title: event.title,
      message: `${event.title} — ${formatEventDateLong(event.startsAt)}\n${siteConfig.url}/events/${event.id}`,
    }).catch(() => {
      toast.error('Could not open share sheet');
    });
  }, [event]);

  const handleRsvp = useCallback(() => {
    if (!event) return;

    requireWallet(() => {
      const going = currentUser
        ? event.attendeeIds.includes(currentUser.id)
        : false;

      const pendingId = going
        ? toast.pending('Cancelling RSVP', 'Returning your ticket')
        : toast.pending('Confirming RSVP', 'Approve the transaction in your wallet');

      analytics.track(AnalyticsEvent.EventRsvp, { eventId: event.id });

      toggleRsvp.mutate(event, {
        onSuccess: ({ wasGoing }) => {
          toast.dismiss(pendingId);
          haptics.success();
          if (wasGoing) {
            toast.info('RSVP cancelled', 'Your ticket has been returned.');
          } else {
            toast.success(
              'You are going',
              'Your NFT ticket has been minted to your wallet.',
            );
          }
        },
        onError: (error) => {
          toast.dismiss(pendingId);
          haptics.error();
          toast.error(
            'RSVP failed',
            error instanceof Error ? error.message : 'Please try again.',
          );
        },
      });
    });
  }, [currentUser, event, requireWallet, toggleRsvp]);

  if (isLoading) return <ScreenLoader label="Loading event" />;

  if (isError || !event) {
    return (
      <Screen padded>
        <View className="flex-1 justify-center">
          <ErrorState
            title="Event not found"
            description="This event may have been removed, or the link is wrong."
            onRetry={() => refetch()}
          />
        </View>
      </Screen>
    );
  }

  const colors = resolveCoverGradient(event.coverGradient);
  const going = currentUser
    ? event.attendeeIds.includes(currentUser.id)
    : false;
  const countdown = countdownLabel(event.startsAt, event.endsAt);
  const isLive = countdown === 'Live now';
  const hasEnded = countdown === 'Ended';
  const filled = fillPercent(event.attendeeIds.length, event.capacity);
  const spotsLeft = Math.max(0, event.capacity - event.attendeeIds.length);

  return (
    <Screen edgeTop={false} aurora={false}>
      <AnimatedHeader
        title={event.title}
        scrollY={scrollY}
        threshold={HERO_HEIGHT - 90}
        onBack={() => router.back()}
        right={
          <IconButton
            icon={Share2}
            label="Share event"
            onPress={handleShare}
            variant="glass"
            size={38}
            iconSize={17}
          />
        }
      />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Hero */}
        <View style={{ height: HERO_HEIGHT, overflow: 'hidden' }}>
          <Animated.View style={[{ flex: 1 }, heroStyle]}>
            <LinearGradient
              colors={[colors[0], colors[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', inset: 0 }}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'transparent']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.85, y: 0.7 }}
              style={{ position: 'absolute', inset: 0 }}
            />
          </Animated.View>

          {/* Scrim so the title stays readable regardless of gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(5,8,22,0.6)', '#050816']}
            locations={[0.3, 0.72, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />

          <View
            className="absolute bottom-0 left-0 right-0"
            style={{ paddingHorizontal: screenPadding, paddingBottom: 4 }}
          >
            <View className="flex-row flex-wrap gap-2">
              <Badge label={event.category} variant="default" />
              {event.tokenGated && (
                <Badge label="Token-gated" variant="purple" icon={Lock} />
              )}
              {isLive && <Badge label="Live now" variant="live" dot />}
              {event.visibility === 'private' && (
                <Badge label="Private" variant="warning" />
              )}
            </View>

            <Text variant="display" className="mt-3" numberOfLines={3}>
              {event.title}
            </Text>
          </View>
        </View>

        {/* Countdown + price */}
        <Animated.View
          entering={FadeInDown.duration(400)}
          className="mt-5 flex-row items-center gap-3"
          style={{ paddingHorizontal: screenPadding }}
        >
          <View
            className="flex-1 flex-row items-center gap-2 border border-white/10 bg-white/[0.04] px-3.5 py-3"
            style={{ borderRadius: radius.xl }}
          >
            <Clock size={15} color={brand.cyan} strokeWidth={2.2} />
            <Text variant="bodySm" style={{ fontFamily: fontFamily.medium }}>
              {countdown}
            </Text>
          </View>
          <View
            className="flex-row items-center gap-2 border border-white/10 bg-white/[0.04] px-3.5 py-3"
            style={{ borderRadius: radius.xl }}
          >
            <Ticket size={15} color={brand.green} strokeWidth={2.2} />
            <Text variant="bodySm" style={{ fontFamily: fontFamily.semibold }}>
              {event.price}
            </Text>
          </View>
        </Animated.View>

        {/* Meta */}
        <Section delay={60}>
          <View
            className="border border-white/10 bg-white/[0.03] px-4 py-1"
            style={{ borderRadius: radius['2xl'] }}
          >
            <MetaRow
              icon={Calendar}
              label="Date"
              value={formatEventDateLong(event.startsAt)}
              accent={brand.purple}
            />
            <View className="h-px bg-white/[0.06]" />
            <MetaRow
              icon={Clock}
              label="Time"
              value={formatEventTimeRange(event.startsAt, event.endsAt)}
              accent={brand.blue}
            />
            <View className="h-px bg-white/[0.06]" />
            <MetaRow
              icon={event.isOnline ? Globe : MapPin}
              label={event.isOnline ? 'Online' : 'Location'}
              value={event.location}
              accent={brand.cyan}
            />
          </View>
        </Section>

        {/* Capacity */}
        <Section delay={100}>
          <View
            className="border border-white/10 bg-white/[0.03] p-4"
            style={{ borderRadius: radius['2xl'] }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Users size={15} color="#94a2b8" strokeWidth={2.2} />
                <Text variant="bodySm" style={{ fontFamily: fontFamily.medium }}>
                  {plural(event.attendeeIds.length, 'guest')} going
                </Text>
              </View>
              <Text
                variant="caption"
                style={{ color: spotsLeft < 20 ? brand.cyan : '#94a2b8' }}
              >
                {spotsLeft === 0
                  ? 'Waitlist only'
                  : `${plural(spotsLeft, 'spot')} left`}
              </Text>
            </View>
            <ProgressBar
              percent={filled}
              className="mt-3"
              label={`${event.attendeeIds.length} of ${event.capacity} spots taken`}
            />
          </View>
        </Section>

        {/* Host */}
        {host && (
          <Section title="Organizer" delay={140}>
            <View
              className="border border-white/10 bg-white/[0.03] px-4"
              style={{ borderRadius: radius['2xl'] }}
            >
              <ProfileCard
                user={host}
                showReputation
                onPress={(u: User) => router.push(`/user/${u.id}`)}
              />
            </View>
          </Section>
        )}

        {/* Wallet requirement / token gate */}
        <Section delay={180}>
          <View
            className={
              event.tokenGated
                ? 'flex-row items-start gap-3 border border-brand-purple/25 bg-brand-purple/[0.07] p-4'
                : 'flex-row items-start gap-3 border border-white/10 bg-white/[0.03] p-4'
            }
            style={{ borderRadius: radius['2xl'] }}
          >
            <Lock
              size={17}
              color={event.tokenGated ? brand.purple : '#94a2b8'}
              strokeWidth={2}
            />
            <View className="flex-1">
              <Text variant="title">
                {event.tokenGated ? 'Token-gated entry' : 'Wallet required'}
              </Text>
              <Text variant="caption" className="mt-1 text-muted-foreground">
                {event.tokenGated
                  ? (event.gateRequirement ??
                    'Your wallet must hold the required asset to RSVP.')
                  : 'RSVP is signed from your wallet — that is what keeps this bot-free.'}
              </Text>
              {event.requiresApproval && (
                <Text variant="caption" className="mt-1.5 text-muted-foreground">
                  The organizer reviews each request before your ticket mints.
                </Text>
              )}
            </View>
          </View>
        </Section>

        {/* NFT ticket preview */}
        <Section title="Your NFT ticket" delay={220}>
          <View
            className="overflow-hidden border border-white/10"
            style={{ borderRadius: radius['2xl'] }}
          >
            <LinearGradient
              colors={[colors[0], colors[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', inset: 0, opacity: 0.22 }}
            />
            <View className="flex-row items-center gap-3.5 p-4">
              <View
                className="items-center justify-center border border-white/12 bg-black/30"
                style={{ width: 56, height: 56, borderRadius: radius.lg }}
              >
                <Ticket size={26} color="#f8fafc" strokeWidth={1.7} />
              </View>
              <View className="flex-1">
                <Text variant="title">
                  {ticket ? `Ticket #${String(ticket.serial).padStart(4, '0')}` : 'Compressed NFT'}
                </Text>
                <Text variant="caption" className="mt-1 text-muted-foreground">
                  {ticket
                    ? `${ticket.tier}${ticket.soulbound ? ' · soulbound' : ''} — in your wallet`
                    : 'Minted to your wallet the moment you RSVP, for a fraction of a cent.'}
                </Text>
              </View>
              {ticket && (
                <Button
                  label="View"
                  variant="secondary"
                  size="sm"
                  onPress={() => router.push(`/ticket/${ticket.id}`)}
                />
              )}
            </View>
          </View>
        </Section>

        {/* Community */}
        {community && (
          <Section title="Community" delay={260}>
            <View
              className="flex-row items-center gap-3.5 border border-white/10 bg-white/[0.03] p-4"
              style={{ borderRadius: radius['2xl'] }}
            >
              <View
                className="items-center justify-center"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: radius.lg,
                  backgroundColor: `${accents[community.accent]}1c`,
                }}
              >
                <DynamicIcon
                  name={community.icon}
                  size={21}
                  color={accents[community.accent]}
                  strokeWidth={2}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text variant="title">{community.name}</Text>
                  {community.verified && (
                    <BadgeCheck
                      size={14}
                      color={accents[community.accent]}
                      strokeWidth={2.4}
                    />
                  )}
                </View>
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  {plural(community.memberCount, 'member')}
                </Text>
              </View>
              <Button
                label="View"
                variant="secondary"
                size="sm"
                onPress={() => router.push(`/community/${community.id}`)}
              />
            </View>
          </Section>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <Section title="Who's going" delay={300}>
            <View
              className="border border-white/10 bg-white/[0.03] p-4"
              style={{ borderRadius: radius['2xl'] }}
            >
              <AvatarStack
                users={attendees}
                max={6}
                size={34}
                total={event.attendeeIds.length}
              />
              <Text variant="caption" className="mt-3 text-muted-foreground">
                {attendees
                  .slice(0, 2)
                  .map((a) => a.name)
                  .join(', ')}
                {event.attendeeIds.length > 2 &&
                  ` and ${event.attendeeIds.length - 2} others are going`}
              </Text>
            </View>
          </Section>
        )}

        {/* Schedule */}
        {event.schedule && event.schedule.length > 0 && (
          <Section title="Schedule" delay={340}>
            <View
              className="border border-white/10 bg-white/[0.03] p-4"
              style={{ borderRadius: radius['2xl'] }}
            >
              {event.schedule.map((slot, index) => (
                <View key={slot.id} className="flex-row gap-3.5">
                  {/* Timeline rail */}
                  <View className="items-center">
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        marginTop: 5,
                        backgroundColor:
                          index === 0 ? brand.cyan : 'rgba(255,255,255,0.25)',
                      }}
                    />
                    {index < event.schedule!.length - 1 && (
                      <View className="w-px flex-1 bg-white/12" />
                    )}
                  </View>

                  <View className="flex-1 pb-4">
                    <Text
                      variant="caption"
                      style={{
                        color: brand.cyan,
                        fontFamily: fontFamily.mono,
                      }}
                    >
                      {slot.time}
                    </Text>
                    <Text
                      variant="bodySm"
                      className="mt-0.5"
                      style={{ fontFamily: fontFamily.medium }}
                    >
                      {slot.title}
                    </Text>
                    {slot.speaker && (
                      <Text
                        variant="caption"
                        className="mt-0.5 text-muted-foreground"
                      >
                        {slot.speaker} · {slot.durationMins} min
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Description */}
        <Section title="About" delay={380}>
          <Text variant="body" className="text-muted-foreground">
            {event.description}
          </Text>

          {event.tags.length > 0 && (
            <View className="mt-4 flex-row flex-wrap gap-2">
              {event.tags.map((tag) => (
                <Badge key={tag} label={tag} variant="default" size="sm" />
              ))}
            </View>
          )}
        </Section>
      </Animated.ScrollView>

      {/* Sticky RSVP bar */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[#070b1c]/98"
        style={{
          paddingHorizontal: screenPadding,
          paddingTop: 14,
          paddingBottom: insets.bottom + 14,
        }}
      >
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text variant="caption" className="text-muted-foreground">
              {hasEnded
                ? 'This event has ended'
                : going
                  ? "You're on the list"
                  : event.price}
            </Text>
            <Text variant="title" numberOfLines={1}>
              {hasEnded
                ? plural(event.attendeeIds.length, 'attendee')
                : `${plural(spotsLeft, 'spot')} left`}
            </Text>
          </View>

          <Button
            label={
              hasEnded
                ? 'Event ended'
                : going
                  ? "You're going"
                  : event.requiresApproval
                    ? 'Request to join'
                    : 'RSVP on-chain'
            }
            icon={going ? Check : undefined}
            variant={going ? 'secondary' : 'primary'}
            size="lg"
            onPress={handleRsvp}
            disabled={hasEnded}
            loading={toggleRsvp.isPending}
            className="flex-[1.6]"
            accessibilityHint={
              going
                ? 'Cancels your RSVP and returns the ticket'
                : 'Signs an on-chain RSVP and mints your NFT ticket'
            }
          />
        </View>
      </View>

      <ConnectWalletSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onConnected={handleConnected}
      />
    </Screen>
  );
}
