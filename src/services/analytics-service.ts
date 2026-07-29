/**
 * Analytics seam.
 *
 * Calls are no-ops unless `EXPO_PUBLIC_ENABLE_ANALYTICS=true`, and in dev they
 * log so you can see the funnel without a provider attached.
 *
 * TODO(firebase): forward to `@react-native-firebase/analytics`.
 * TODO(posthog):  or `posthog-react-native`, whichever ships first.
 */

import { featureFlags } from '@/constants/config';

type Props = Record<string, unknown>;

export const analytics = {
  track(event: string, props?: Props) {
    if (!featureFlags.enableAnalytics) {
      if (__DEV__) console.debug('[analytics]', event, props ?? {});
      return;
    }
    // TODO: provider.capture(event, props)
  },

  screen(name: string, props?: Props) {
    analytics.track('screen_view', { screen: name, ...props });
  },

  identify(userId: string, traits?: Props) {
    if (!featureFlags.enableAnalytics) {
      if (__DEV__) console.debug('[analytics:identify]', userId, traits ?? {});
      return;
    }
    // TODO: provider.identify(userId, traits)
  },
};

/** Named events, so call sites cannot drift on spelling. */
export const AnalyticsEvent = {
  WalletConnected: 'wallet_connected',
  WalletDisconnected: 'wallet_disconnected',
  GoogleLinked: 'google_linked',
  GoogleUnlinked: 'google_unlinked',
  EventViewed: 'event_viewed',
  EventRsvp: 'event_rsvp',
  EventCreated: 'event_created',
  TicketViewed: 'ticket_viewed',
  TicketCheckedIn: 'ticket_checked_in',
  OnboardingCompleted: 'onboarding_completed',
} as const;
