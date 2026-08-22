/**
 * Analytics seam.
 *
 * No provider is installed. Events are logged in development so the funnel is
 * visible without one, and dropped otherwise.
 *
 * # The flag does not turn anything on
 *
 * `EXPO_PUBLIC_ENABLE_ANALYTICS=true` used to take the "enabled" branch and
 * fall through to an empty body - so switching it on stopped the dev logging
 * *and* still sent nothing, which is a strictly worse state than off and looks
 * from the outside exactly like working analytics. It now says so, once, rather
 * than swallowing the difference.
 *
 * To finish this: install `@react-native-firebase/analytics` or
 * `posthog-react-native`, forward from `capture`/`identifyUser` below, and
 * delete `warnNoProvider`.
 */

import { featureFlags } from '@/constants';

type Props = Record<string, unknown>;

let warned = false;

/** Say it once per session - a warning per tracked event is just noise. */
function warnNoProvider() {
  if (warned) return;
  warned = true;
  console.warn(
    '[analytics] EXPO_PUBLIC_ENABLE_ANALYTICS is true but no provider is ' +
      'installed, so every event is being dropped. Wire one up in ' +
      'services/analytics-service.ts, or unset the flag to get dev logging back.',
  );
}

export const analytics = {
  track(event: string, props?: Props) {
    if (!featureFlags.enableAnalytics) {
      if (__DEV__) console.debug('[analytics]', event, props ?? {});
      return;
    }
    warnNoProvider();
  },

  screen(name: string, props?: Props) {
    analytics.track('screen_view', { screen: name, ...props });
  },

  identify(userId: string, traits?: Props) {
    if (!featureFlags.enableAnalytics) {
      if (__DEV__) console.debug('[analytics:identify]', userId, traits ?? {});
      return;
    }
    warnNoProvider();
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
