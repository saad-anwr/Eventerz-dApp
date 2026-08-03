/**
 * Event details.
 *
 * Full-bleed gradient hero that collapses into a blurred header as you scroll,
 * then animated sections: meta, host, NFT ticket preview, community, attendees,
 * schedule, description. A sticky RSVP bar sits above the safe area.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

import { EventMapCard } from '@/components/cards/event-map-card';
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
  MessageCircle,
  Pencil,
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
import { FeeCancelled, useFee } from '@/hooks/use-fee';
import {
  useApproveGuest,
  useCancelRsvp,
  useDeclineGuest,
  useEvent,
  useEventGuests,
  useGuestPreview,
  useRequestToJoin,
} from '@/hooks/use-events';
import { useTicketForEvent } from '@/hooks/use-tickets';
import { useUser, useUsers } from '@/hooks/use-users';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand, resolveCoverGradient } from '@/theme/colors';
import { androidElevation, radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { siteConfig } from '@/constants/config';
import type { EventItem, User } from '@/types';
import {
  countdownLabel,
  formatEventDateLong,
  formatEventTimeRange,
  plural,
  shortenAddress,
} from '@/utils/format';
import {
  RSVP_PRESENTATION,
  filledPercent,
  goingCount,
  isCancelled,
  isEditable,
  isLiveRsvp,
  myRsvpState,
  rsvpActionLabel,
  rsvpDetail,
  spotsLeft,
} from '@/utils/rsvp';
import { locationOf } from '@/utils/maps';
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

/**
 * Host-side approval queue.
 *
 * Requests needing a decision come first - the point of the panel is that a
 * host opens the event and immediately sees what is waiting on them. Every
 * action goes through an RPC that re-checks host ownership server-side, so
 * rendering this is not what authorises anything.
 */
function GuestManagerSection({ event }: { event: EventItem }) {
  const { data: guests = [] } = useEventGuests(event.id);
  const approve = useApproveGuest();
  const decline = useDeclineGuest();
  const busy = approve.isPending || decline.isPending;

  const waiting = guests.filter(
    (g) => g.status === 'pending' || g.status === 'waitlist',
  );
  const confirmed = guests.filter((g) => g.status === 'confirmed');

  const act = useCallback(
    (
      mutation: typeof approve | typeof decline,
      profileId: string,
      verb: string,
    ) => {
      mutation.mutate(
        { eventId: event.id, profileId },
        {
          onSuccess: () => {
            haptics.success();
            toast.success(`Guest ${verb}`);
          },
          onError: (error) => {
            haptics.error();
            toast.error(
              `Could not ${verb === 'approved' ? 'approve' : 'decline'}`,
              error instanceof Error ? error.message : 'Please try again.',
            );
          },
        },
      );
    },
    [event.id],
  );

  if (guests.length === 0) return null;

  return (
    <Section title="Guests" delay={320}>
      <View
        className="border border-white/10 bg-white/[0.03] p-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        {waiting.length > 0 && (
          <>
            <Text
              variant="caption"
              className="mb-2"
              style={{ color: '#fbbf24', fontFamily: fontFamily.semibold }}
            >
              {plural(waiting.length, 'request')} waiting on you
            </Text>
            {waiting.map((guest) => (
              <View
                key={guest.profileId}
                className="mb-2 flex-row items-center gap-3 border border-white/10 bg-white/[0.02] p-2.5"
                style={{ borderRadius: radius.xl }}
              >
                <View className="flex-1">
                  <Text
                    variant="bodySm"
                    numberOfLines={1}
                    style={{ fontFamily: fontFamily.medium }}
                  >
                    {guest.name}
                  </Text>
                  <Text variant="caption" className="text-muted-foreground">
                    {guest.status === 'waitlist' ? 'Waitlisted' : 'Requested'}
                  </Text>
                </View>
                <Button
                  label="Approve"
                  size="sm"
                  onPress={() => act(approve, guest.profileId, 'approved')}
                  disabled={busy}
                />
                <Button
                  label="Decline"
                  size="sm"
                  variant="secondary"
                  onPress={() => act(decline, guest.profileId, 'declined')}
                  disabled={busy}
                />
              </View>
            ))}
          </>
        )}

        {confirmed.length > 0 && (
          <>
            <Text
              variant="caption"
              className="mb-2 mt-2"
              style={{ color: brand.green, fontFamily: fontFamily.semibold }}
            >
              {plural(confirmed.length, 'guest')} going
            </Text>
            {confirmed.slice(0, 8).map((guest) => (
              <View
                key={guest.profileId}
                className="flex-row items-center justify-between py-1.5"
              >
                <Text variant="bodySm" numberOfLines={1} className="flex-1">
                  {guest.name}
                </Text>
                <Text variant="caption" className="text-muted-foreground">
                  {guest.checkedInAt
                    ? 'Checked in'
                    : guest.ticketSerial
                      ? `#${String(guest.ticketSerial).padStart(4, '0')}`
                      : ''}
                </Text>
              </View>
            ))}
            {confirmed.length > 8 && (
              <Text variant="caption" className="mt-1 text-muted-foreground">
                +{confirmed.length - 8} more
              </Text>
            )}
          </>
        )}
      </View>
    </Section>
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

  /**
   * Measured height of the sticky RSVP bar, so the scroll content can reserve
   * exactly that much. Seeded with a sensible first-paint value - the real one
   * arrives on the bar's first `onLayout`, one frame later.
   */
  const [barHeight, setBarHeight] = useState(96 + insets.bottom);

  /** $1 in SOL, taken before the RSVP is sent. Free on devnet/testnet. */
  const { payFee: payRsvpFee, paying: payingFee } = useFee('rsvp');

  const { sheetVisible, requireWallet, closeSheet, handleConnected } =
    useConnectWallet();

  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const { data: host } = useUser(event?.hostId);
  const { data: community } = useCommunity(event?.communityId);
  const { data: ticket } = useTicketForEvent(id);
  const currentUser = useWalletStore((s) => s.user);
  const walletAddress = useWalletStore((s) => s.account?.address ?? null);

  // Computed before the loading guard below, so both must tolerate no event yet.
  const myStatus = event ? myRsvpState(event, currentUser?.id) : undefined;
  const isHost = Boolean(currentUser && event?.hostId === currentUser.id);
  /*
   * The roster is gated to the host and confirmed guests, matching the RLS in
   * migration 0005. Everyone else gets a bounded preview instead.
   */
  const canSeeRoster = isHost || myStatus === 'confirmed';

  const attendeePreview = useMemo(
    () => (canSeeRoster ? (event?.attendeeIds.slice(0, 8) ?? []) : []),
    [canSeeRoster, event?.attendeeIds],
  );
  const { data: attendees = [] } = useUsers(attendeePreview);
  const { data: guestPreview = [] } = useGuestPreview(
    canSeeRoster ? undefined : event?.id,
    3,
  );

  const requestToJoin = useRequestToJoin();
  const cancelRsvp = useCancelRsvp();
  // Includes the fee step: the wallet is open and the button must not look
  // idle while a charge is waiting to be approved.
  const busy = requestToJoin.isPending || cancelRsvp.isPending || payingFee;

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
      message: `${event.title} - ${formatEventDateLong(event.startsAt)}\n${siteConfig.url}/events/${event.id}`,
    }).catch(() => {
      toast.error('Could not open share sheet');
    });
  }, [event]);

  /**
   * Request to attend, or withdraw an existing claim.
   *
   * The success toast reports what the *server* decided rather than what the tap
   * hoped for - a request against an approval-gated or full event does not mint
   * a ticket, and saying it did was the bug.
   */
  const handleRsvp = useCallback(() => {
    if (!event) return;

    requireWallet(() => {
      const live = isLiveRsvp(myRsvpState(event, currentUser?.id));

      if (live) {
        const pendingId = toast.pending(
          'Cancelling',
          'Releasing your spot',
        );
        cancelRsvp.mutate(event, {
          onSuccess: () => {
            toast.dismiss(pendingId);
            haptics.success();
            toast.info('RSVP cancelled', 'Your spot has been released.');
          },
          onError: (error) => {
            toast.dismiss(pendingId);
            haptics.error();
            toast.error(
              'Could not cancel',
              error instanceof Error ? error.message : 'Please try again.',
            );
          },
        });
        return;
      }

      /*
       * Fee first, RSVP second.
       *
       * The other order gives away a free RSVP whenever the payment fails, and
       * there is no way to withdraw a seat that has already been granted. The
       * cost of this ordering is the opposite case - fee taken, RSVP failed -
       * which is recoverable and is called out explicitly below rather than
       * hidden behind "please try again".
       */
      void (async () => {
        let feeSignature: string | null = null;
        try {
          feeSignature = await payRsvpFee();
        } catch (error) {
          if (error instanceof FeeCancelled) return;
          haptics.error();
          toast.error(
            'Could not take the RSVP fee',
            error instanceof Error ? error.message : 'Please try again.',
          );
          return;
        }

        const pendingId = toast.pending(
          event.requiresApproval ? 'Sending request' : 'Confirming RSVP',
          event.requiresApproval
            ? 'Asking the host to approve you'
            : 'Reserving your spot',
        );

        requestToJoin.mutate(event, {
        onSuccess: (updated) => {
          toast.dismiss(pendingId);
          haptics.success();
          switch (updated.myStatus) {
            case 'pending':
              toast.success(
                'Requested to attend',
                'The host has been notified. You will hear back here.',
              );
              break;
            case 'waitlist':
              toast.info(
                'You are on the waitlist',
                'We will let you in automatically if a spot opens.',
              );
              break;
            default:
              toast.success('You are going', 'Your ticket is ready.');
          }
        },
        onError: (error) => {
          toast.dismiss(pendingId);
          haptics.error();
          toast.error(
            'RSVP failed',
            feeSignature
              ? // The money moved. Saying only "try again" would invite a
                // second charge for a seat they may already have paid for.
                'Your fee was taken but the RSVP did not go through. Contact support with your wallet address - do not pay again.'
              : error instanceof Error
                ? error.message
                : 'Please try again.',
          );
        },
        });
      })();
    });
  }, [
    cancelRsvp,
    currentUser,
    event,
    payRsvpFee,
    requestToJoin,
    requireWallet,
  ]);

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
  const going = myStatus === 'confirmed';
  const hasLiveRsvp = isLiveRsvp(myStatus);
  const countdown = countdownLabel(event.startsAt, event.endsAt);
  const isLive = countdown === 'Live now';
  const hasEnded = countdown === 'Ended';
  const totalGoing = goingCount(event);
  const filled = filledPercent(event);
  const seatsLeft = spotsLeft(event);
  const presentation = myStatus ? RSVP_PRESENTATION[myStatus] : null;
  const cancelled = isCancelled(event);

  return (
    <Screen edgeTop={false} aurora={false}>
      <AnimatedHeader
        title={event.title}
        scrollY={scrollY}
        threshold={HERO_HEIGHT - 90}
        onBack={() => router.back()}
        right={
          <View className="flex-row items-center gap-2">
            {/* The host's entry point. Hidden once the event is cancelled or
                over, because `update_event` refuses both - a button that can
                only produce an error is worse than no button. */}
            {isHost && isEditable(event) && (
              <IconButton
                icon={Pencil}
                label="Edit event"
                onPress={() => router.push(`/event/edit/${event.id}`)}
                variant="glass"
                size={38}
                iconSize={16}
              />
            )}
            <IconButton
              icon={Share2}
              label="Share event"
              onPress={handleShare}
              variant="glass"
              size={38}
              iconSize={17}
            />
          </View>
        }
      />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: barHeight + 24 }}
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
            {/*
              The host's banner.

              This hero rendered the gradient and nothing else, so an event with
              a banner showed its artwork on the website and a flat colour wash
              in the app - including to the host who had just uploaded it, which
              is what made the upload look like it had failed when the real
              failure was upstream (see `uploadEventBanner`).
            */}
            {event.coverImage && (
              <Image
                source={{ uri: event.coverImage }}
                style={{ position: 'absolute', inset: 0 }}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                accessibilityIgnoresInvertColors
              />
            )}
            {/* The white lift belongs to the bare gradient only - over a photo
                it washes out the badges. See the event card for the argument. */}
            {!event.coverImage && (
              <LinearGradient
                colors={['rgba(255,255,255,0.30)', 'transparent']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.85, y: 0.7 }}
                style={{ position: 'absolute', inset: 0 }}
              />
            )}
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
                  {plural(totalGoing, 'guest')} going
                </Text>
              </View>
              <Text
                variant="caption"
                style={{ color: seatsLeft < 20 ? brand.cyan : '#94a2b8' }}
              >
                {seatsLeft === 0
                  ? 'Waitlist only'
                  : `${plural(seatsLeft, 'spot')} left`}
              </Text>
            </View>
            <ProgressBar
              percent={filled}
              className="mt-3"
              label={`${totalGoing} of ${event.capacity} spots taken`}
            />
            {/* Only the host can act on pending requests, so only the host is
                told about them. */}
            {isHost && (event.pendingCount ?? 0) > 0 && (
              <Text
                variant="caption"
                className="mt-2"
                style={{ color: '#fbbf24' }}
              >
                {plural(event.pendingCount ?? 0, 'request')} waiting on your
                approval
              </Text>
            )}
          </View>
        </Section>

        {cancelled && (
          <Section delay={100}>
            <View
              className="border p-4"
              style={{
                borderRadius: radius['2xl'],
                borderColor: 'rgba(248,113,113,0.35)',
                backgroundColor: 'rgba(248,113,113,0.10)',
              }}
            >
              <Text
                variant="bodySm"
                style={{ fontFamily: fontFamily.semibold, color: '#fca5a5' }}
              >
                This event has been cancelled
              </Text>
              <Text variant="caption" className="mt-1 text-muted-foreground">
                {event.cancelReason ??
                  'The host called it off. Everyone holding a spot has been notified.'}
              </Text>
            </View>
          </Section>
        )}

        {/* This viewer's RSVP state - the host's decision lands here. */}
        {presentation && !isHost && (
          <Section delay={110}>
            <View
              className="border p-4"
              style={{
                borderRadius: radius['2xl'],
                borderColor: `${presentation.accent}40`,
                backgroundColor: `${presentation.accent}14`,
              }}
            >
              <Text
                variant="bodySm"
                style={{
                  fontFamily: fontFamily.semibold,
                  color: presentation.accent,
                }}
              >
                {presentation.label}
              </Text>
              {/*
                `rsvpDetail` rather than the raw presentation string: the
                waitlist case is specialised to include the guest's place in the
                queue. "On the waitlist" alone is not actionable - third in line
                means keep the evening free, fortieth means make other plans.
              */}
              <Text variant="caption" className="mt-1 text-muted-foreground">
                {rsvpDetail(event, myStatus!)}
              </Text>
              {myStatus === 'waitlist' && event.waitlistPosition ? (
                <View
                  className="mt-2 self-start bg-black/25 px-2.5 py-1"
                  style={{ borderRadius: radius.full }}
                >
                  <Text
                    variant="micro"
                    style={{
                      fontFamily: fontFamily.semibold,
                      color: presentation.accent,
                    }}
                  >
                    #{event.waitlistPosition} of {event.waitlistCount ?? 0} waiting
                  </Text>
                </View>
              ) : null}
            </View>
          </Section>
        )}

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
              {/*
                Contact host, deliberately not gated on friendship: someone
                deciding whether to attend usually has one question, and making
                them send a friend request first turns a thirty-second exchange
                into a two-step negotiation. DMs were already open to any two
                profiles under `can_access_channel`; what was missing was a way
                in, and an inbox that showed the reply.
              */}
              {!isHost && currentUser && (
                <View className="border-t border-white/10 pb-3 pt-3">
                  <Button
                    label="Contact host"
                    icon={MessageCircle}
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onPress={() => router.push(`/messages/${host.id}`)}
                  />
                </View>
              )}
            </View>
          </Section>
        )}

        {/* The venue. Renders nothing for an online event. */}
        {!event.isOnline && (
          <Section title="Where" delay={160}>
            <EventMapCard place={locationOf(event)} />
          </Section>
        )}

        {/*
          Wallet requirement / token gate.

          "Wallet required" used to show even with a wallet already connected,
          which reads as an unmet condition blocking the RSVP - the one thing
          this panel should never imply when it is already satisfied. A
          connected wallet now gets the settled state, and names the address so
          it is obvious *which* wallet will sign.

          Token gates are unchanged: holding the asset is a separate question
          from being connected, and it is checked at RSVP.
        */}
        <Section delay={180}>
          <View
            className={
              event.tokenGated
                ? 'flex-row items-start gap-3 border border-brand-purple/25 bg-brand-purple/[0.07] p-4'
                : 'flex-row items-start gap-3 border border-white/10 bg-white/[0.03] p-4'
            }
            style={{ borderRadius: radius['2xl'] }}
          >
            {!event.tokenGated && walletAddress ? (
              <BadgeCheck size={17} color={brand.green} strokeWidth={2} />
            ) : (
              <Lock
                size={17}
                color={event.tokenGated ? brand.purple : '#94a2b8'}
                strokeWidth={2}
              />
            )}
            <View className="flex-1">
              <Text variant="title">
                {event.tokenGated
                  ? 'Token-gated entry'
                  : walletAddress
                    ? 'Wallet connected'
                    : 'Wallet required'}
              </Text>
              <Text variant="caption" className="mt-1 text-muted-foreground">
                {event.tokenGated
                  ? (event.gateRequirement ??
                    'Your wallet must hold the required asset to RSVP.')
                  : walletAddress
                    ? `${shortenAddress(walletAddress, 4)} will sign your RSVP.`
                    : 'RSVP is signed from your wallet - that is what keeps this bot-free.'}
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
              {/*
                Three states, and the copy has to match the one you are in.

                It used to say "Minted to your wallet the moment you RSVP, for a
                fraction of a cent" whenever no ticket was found - to someone
                who had just RSVP'd, that reads as a mint that did not happen.
                Compressed-NFT minting is not implemented at all (the wallet
                adapter refuses `mint-ticket` outright), so the sentence was
                describing a feature that does not exist.

                A ticket row with no `assetId` is still a real, scannable ticket
                - it is the QR at the door that admits you. Only the on-chain
                half is missing, and that is what this now says.
              */}
              <View className="flex-1">
                <Text variant="title">
                  {ticket
                    ? `Ticket #${String(ticket.serial).padStart(4, '0')}`
                    : going
                      ? 'Being issued'
                      : 'Your ticket'}
                </Text>
                <Text variant="caption" className="mt-1 text-muted-foreground">
                  {ticket
                    ? ticket.assetId
                      ? `${ticket.tier}${ticket.soulbound ? ' · soulbound' : ''} - in your wallet`
                      : `${ticket.tier} - scannable at the door. Not yet on-chain.`
                    : going
                      ? 'Your ticket is being created. Pull to refresh in a moment.'
                      : 'RSVP to get a ticket with a QR code for the door.'}
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
                onPress={() => router.push(`/communities/${community.id}`)}
              />
            </View>
          </Section>
        )}

        {/*
          Who's going. The full roster for the host and confirmed guests; a
          bounded preview for everyone else. Which one renders is decided by
          what the database returned, not by a prop - RLS is the gate.
        */}
        {totalGoing > 0 && (
          <Section title="Who's going" delay={300}>
            <View
              className="border border-white/10 bg-white/[0.03] p-4"
              style={{ borderRadius: radius['2xl'] }}
            >
              {canSeeRoster ? (
                <>
                  <AvatarStack
                    users={attendees}
                    max={6}
                    size={34}
                    total={totalGoing}
                  />
                  <Text variant="caption" className="mt-3 text-muted-foreground">
                    {attendees
                      .slice(0, 2)
                      .map((a) => a.name)
                      .join(', ')}
                    {totalGoing > 2 &&
                      ` and ${totalGoing - 2} others are going`}
                  </Text>
                </>
              ) : (
                <>
                  <Text variant="bodySm" style={{ fontFamily: fontFamily.medium }}>
                    {guestPreview.length === 0
                      ? `${plural(totalGoing, 'person')} going`
                      : `${guestPreview.map((g) => g.name.split(' ')[0]).join(', ')}${
                          totalGoing > guestPreview.length
                            ? ` and ${totalGoing - guestPreview.length} others are going`
                            : guestPreview.length === 1
                              ? ' is going'
                              : ' are going'
                        }`}
                  </Text>
                  <View className="mt-3 flex-row items-center gap-1.5">
                    <Lock size={12} color="#94a2b8" strokeWidth={2.2} />
                    <Text variant="caption" className="text-muted-foreground">
                      The full guest list is visible to confirmed guests.
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Section>
        )}

        {/* Host-only: the approval queue. */}
        {isHost && <GuestManagerSection event={event} />}

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

      {/*
        Sticky RSVP bar.

        `elevation` is not decoration here. On Android it decides draw order and
        beats `zIndex`, and this bar had none while every card below carries 8
        (`shadow.card`) - so the map card drew straight through it and the
        "99 spots left" line collided with the address. Opaque background for
        the same reason: at 98% the content behind still read through.

        Its height is measured rather than assumed. The scroll content used a
        fixed 140pt of bottom padding, which ignored `insets.bottom` - so on a
        gesture-nav device the bar is taller than the gap reserved for it and
        the last card slides underneath.
      */}
      <View
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[#070b1c]"
        style={{
          paddingHorizontal: screenPadding,
          paddingTop: 14,
          paddingBottom: insets.bottom + 14,
          elevation: androidElevation.chrome,
        }}
      >
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text variant="caption" className="text-muted-foreground">
              {cancelled
                ? 'Cancelled by the host'
                : hasEnded
                  ? 'This event has ended'
                  : presentation
                    ? presentation.label
                    : event.price}
            </Text>
            <Text variant="title" numberOfLines={1}>
              {hasEnded
                ? plural(totalGoing, 'attendee')
                : `${plural(seatsLeft, 'spot')} left`}
            </Text>
          </View>

          {/*
            The host cannot RSVP to their own event, so they get the guest count
            instead of a button that would only ever error.
          */}
          {isHost ? (
            <Button
              label="You're hosting"
              icon={BadgeCheck}
              variant="secondary"
              size="lg"
              onPress={() => {}}
              disabled
              className="flex-[1.6]"
            />
          ) : (
            <Button
              label={
                cancelled
                  ? 'Event cancelled'
                  : hasEnded
                    ? 'Event ended'
                    : hasLiveRsvp
                      ? going
                        ? "You're going"
                        : myStatus === 'pending'
                          ? 'Requested'
                          : 'Waitlisted'
                      : rsvpActionLabel(event)
              }
              icon={going ? Check : myStatus === 'pending' ? Clock : undefined}
              variant={hasLiveRsvp ? 'secondary' : 'primary'}
              size="lg"
              onPress={handleRsvp}
              // A cancelled event takes no more guests - `request_to_join`
              // refuses it, so offering the button would only produce an error.
              disabled={hasEnded || cancelled}
              loading={busy}
              className="flex-[1.6]"
              accessibilityHint={
                hasLiveRsvp
                  ? going
                    ? 'Cancels your RSVP and releases your spot'
                    : 'Withdraws your request to attend'
                  : event.requiresApproval
                    ? 'Sends a request for the host to approve'
                    : 'Reserves your spot and issues your ticket'
              }
            />
          )}
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
