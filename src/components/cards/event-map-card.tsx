/**
 * The venue, as a map card.
 *
 * A **static image** plus a hand-off to the native Maps app, not an interactive
 * map. `react-native-maps` is a native module: adding it means a config plugin,
 * a prebuild and a fresh Gradle run — 17 minutes on this machine — to ship a
 * full map engine for a picture with one pin in it. And the thing a user
 * actually wants from an event's map is directions, which Google Maps does
 * better than any embedded view because it already knows where they are.
 *
 * Three states, all of which have to look deliberate:
 *
 *   • **Pinned, with a Maps key** — the image, plus Open and Directions.
 *   • **Unpinned or no key** — the address and the same two buttons. The
 *     link-out needs no key, so this is a reduced card rather than a broken one.
 *     It is also the common case for events created before migration 0006, so it
 *     must not look like something failed to load.
 *   • **Online** — renders nothing. A map of an online event is a map of
 *     nowhere.
 */

import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import { View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { ExternalLink, MapPin, Send } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { accents, brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import {
  coordinatesOf,
  directionsUrl,
  hasGoogleMapsKey,
  mapLinkUrl,
  staticMapUrl,
  type MappableLocation,
} from '@/utils/maps';
import { haptics } from '@/utils/haptics';
import { toast } from '@/store/toast-store';

interface EventMapCardProps {
  place: MappableLocation;
}

function MapAction({
  label,
  icon: Icon,
  url,
  tint,
}: {
  label: string;
  icon: typeof MapPin;
  url: string;
  tint: string;
}) {
  const open = useCallback(async () => {
    haptics.selection();
    try {
      await Linking.openURL(url);
    } catch {
      // `openURL` rejects when no app can handle the scheme, which on a device
      // with no browser and no Maps app is a real state rather than a bug.
      toast.error('No app on this device can open maps.');
    }
  }, [url]);

  return (
    <PressableScale
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5"
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: `${tint}55`,
        backgroundColor: `${tint}18`,
      }}
    >
      <Icon size={14} color={tint} />
      <Text variant="label" style={{ color: tint }}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function EventMapCard({ place }: EventMapCardProps) {
  if (place.isOnline) return null;

  const label = place.location?.trim();
  const coords = coordinatesOf(place);
  const image = staticMapUrl(place, { width: 640, height: 220 });
  if (!label && !coords) return null;

  return (
    <GlassCard className="overflow-hidden">
      {image ? (
        <Image
          source={{ uri: image }}
          // `contentFit` rather than `resizeMode`: expo-image's prop. A static
          // map is delivered at exactly the requested aspect ratio, so cover
          // crops nothing and avoids letterboxing on odd screen widths.
          contentFit="cover"
          transition={200}
          style={{ width: '100%', height: 150 }}
          accessibilityLabel={`Map of ${label}`}
        />
      ) : (
        <View
          className="items-center justify-center"
          style={{ height: 84, backgroundColor: 'rgba(255,255,255,0.03)' }}
        >
          <MapPin size={22} color="rgba(255,255,255,0.28)" />
        </View>
      )}

      <View className="gap-3 p-4">
        <View className="flex-row items-start gap-3">
          <View
            className="items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.lg,
              backgroundColor: `${brand.purple}26`,
            }}
          >
            <MapPin size={15} color={brand.purple} />
          </View>

          <View className="flex-1">
            <Text variant="label" numberOfLines={2}>
              {label}
            </Text>
            {place.address && place.address !== label && (
              <Text variant="caption" className="mt-0.5 text-muted" numberOfLines={2}>
                {place.address}
              </Text>
            )}
            {!coords && (
              <Text variant="caption" className="mt-0.5 text-muted">
                {hasGoogleMapsKey()
                  ? 'Approximate — the host did not pin an exact spot.'
                  : 'Open in Maps to search for this address.'}
              </Text>
            )}
          </View>
        </View>

        <View className="flex-row gap-2">
          <MapAction
            label="Open"
            icon={ExternalLink}
            url={mapLinkUrl(place)}
            tint={accents.cyan}
          />
          <MapAction
            label="Directions"
            icon={Send}
            url={directionsUrl(place)}
            tint={brand.purple}
          />
        </View>
      </View>
    </GlassCard>
  );
}
