/**
 * Check-in landing route.
 *
 * Handles `https://eventerz.xyz/checkin?ticket=..&secret=..` - the payload every
 * ticket QR now carries - when Android hands that URL to the app instead of the
 * browser (see the `intentFilters` block in `app.json`).
 *
 * # Why the QR is a URL at all
 *
 * A camera pointed at the old `eventerz:v1:checkin?...` payload reported "No
 * usable data found", because a custom scheme means nothing to anything that
 * has not been taught it. That left a host whose in-app scanner would not open
 * with no way to read a code that was sitting right in front of them. An https
 * payload is understood by every camera; this route is what makes it land
 * somewhere useful rather than in a browser tab.
 *
 * # Why it redeems here rather than bouncing to `/scan`
 *
 * `/scan` opens a camera. Someone arriving here has *already* scanned - sending
 * them to a viewfinder to scan the code they are holding is a loop. So this
 * screen performs the same redemption the scanner does and shows the same
 * outcome, then offers the scanner for the next guest in the queue.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { BadgeCheck, QrCode } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useRedeemTicket } from '@/hooks/use-tickets';
import { brand } from '@/theme/colors';
import { screenPadding } from '@/theme/layout';
import { haptics } from '@/utils/haptics';

export default function CheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ticket?: string; secret?: string }>();
  const redeem = useRedeemTicket();

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /*
   * A malformed link is derived, not stateful - it is a fact about the params
   * this screen was given. Computing it during render rather than writing it
   * with `setError` inside the effect avoids a cascading render, and means the
   * effect below has exactly one job: perform the check-in.
   */
  const incomplete = !params.ticket || !params.secret;

  // The deep link can be re-delivered while this screen is mounted; redeeming
  // twice would report "already checked in" for a check-in this screen just did.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (incomplete) return;
    handled.current = true;

    redeem.mutate(
      `https://eventerz.xyz/checkin?ticket=${params.ticket}&secret=${params.secret}`,
      {
        onSuccess: () => {
          haptics.success();
          setDone(true);
        },
        onError: (e) => {
          haptics.error();
          setError(e instanceof Error ? e.message : 'Check-in failed.');
        },
      },
    );
  }, [params.ticket, params.secret, incomplete, redeem]);

  const failure = incomplete
    ? 'That link is missing part of the ticket code.'
    : error;

  return (
    <Screen padded>
      <View
        className="flex-1 items-center justify-center gap-5"
        style={{ paddingHorizontal: screenPadding }}
      >
        {!done && !failure && (
          <>
            <Spinner />
            <Text variant="body" className="text-muted-foreground">
              Checking this ticket in...
            </Text>
          </>
        )}

        {done && (
          <>
            <BadgeCheck size={56} color={brand.green} strokeWidth={2.2} />
            <Text variant="h2" className="text-center">
              Checked in
            </Text>
            <Text variant="body" className="text-center text-muted-foreground">
              Attendance is recorded and the guest&apos;s Proof-of-Attendance
              badge is on its way.
            </Text>
          </>
        )}

        {failure && (
          <>
            <Text variant="h2" className="text-center">
              Could not check in
            </Text>
            <Text variant="body" className="text-center text-muted-foreground">
              {failure}
            </Text>
          </>
        )}

        {(done || failure) && (
          <View className="mt-4 w-full gap-3">
            <Button
              label="Scan the next guest"
              icon={QrCode}
              onPress={() => router.replace('/scan')}
              fullWidth
            />
            <Button
              label="Done"
              variant="secondary"
              onPress={() => router.replace('/(tabs)')}
              fullWidth
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
