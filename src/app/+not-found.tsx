/**
 * Unmatched route.
 *
 * Without this, Expo Router falls back to its own `Unmatched` screen, which is
 * a developer affordance: it lists the path and offers to open the sitemap.
 * That is exactly wrong for the two ways a user actually gets here, both of
 * which are ordinary:
 *
 *   - a deep link from a notification for something since deleted, and
 *   - an `eventerz://` link shared by someone on a different app version.
 *
 * Mirrors the website's `app/not-found.tsx`, including the choice of exits:
 * someone who followed a dead event link wants another event, so Discover comes
 * first and Home second.
 */

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Compass } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { screenPadding } from '@/theme/layout';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View
        className="flex-1 items-center justify-center gap-3"
        style={{ paddingHorizontal: screenPadding }}
      >
        <Text variant="caption" className="text-muted-foreground">
          404
        </Text>
        <Text variant="h2" className="text-center">
          This page has moved on
        </Text>
        <Text variant="body" className="text-center text-muted-foreground">
          The link may be out of date, or the event it pointed to was cancelled
          and removed by its host.
        </Text>

        <View className="mt-6 w-full gap-3">
          <Button
            label="Browse events"
            icon={Compass}
            fullWidth
            onPress={() => router.replace('/(tabs)/discover')}
          />
          <Button
            label="Go home"
            variant="secondary"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    </Screen>
  );
}
