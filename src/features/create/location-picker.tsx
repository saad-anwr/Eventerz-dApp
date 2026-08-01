/**
 * Location field with search-as-you-type and a map preview.
 *
 * The text input is the primary control and always writable. Search is additive:
 * picking a suggestion attaches coordinates to what is already there, and
 * editing the text afterwards drops them - because a pin that no longer matches
 * the words above it is worse than no pin, and silently keeping the old
 * coordinates is how an event ends up mapped to the venue the host just decided
 * against.
 *
 * A 1:1 counterpart to the website's `components/app/location-picker.tsx`, so a
 * host who creates an event on one platform and edits it on the other gets the
 * same behaviour from the same field.
 */

import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { TextField } from '@/components/ui/form';
import { Check, MapPin, Search, X } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { accents, brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import {
  geocoderName,
  resolvePlace,
  searchPlaces,
  type PlaceSuggestion,
} from '@/utils/geocode';
import { staticMapUrl } from '@/utils/maps';
import { haptics } from '@/utils/haptics';

/**
 * The structured half of a location. All-undefined means "the host typed
 * something a geocoder never saw", which is a supported outcome.
 */
export interface PickedLocation {
  /** What the host wants displayed. Their own words unless they pick a place. */
  location: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
}

interface LocationPickerProps {
  value: PickedLocation;
  onChange: (next: PickedLocation) => void;
  label?: string;
  placeholder?: string;
}

export function LocationPicker({
  value,
  onChange,
  label = 'Location',
  placeholder = 'City, venue or address',
}: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const pinned = typeof value.latitude === 'number';
  const preview = pinned ? staticMapUrl(value, { width: 640, height: 200 }) : null;

  /**
   * Query changes, with the synchronous state moved out of the effect.
   *
   * Clearing results and raising the spinner belong here, in the handler, not in
   * the effect below: they depend on nothing external, so doing them in an
   * effect costs an extra render pass on every keystroke - which is what
   * `react-hooks/set-state-in-effect` objects to.
   */
  const onQueryChange = useCallback((next: string) => {
    setQuery(next);
    if (next.trim().length < 3) {
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }, []);

  /*
   * Debounced fetch - the part that genuinely talks to an external system, and
   * the only thing left in the effect. 350 ms is comfortably inside Nominatim's
   * ~1 req/s policy at typing speed, and short enough that the list feels
   * attached to the keyboard rather than to a timer.
   */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await searchPlaces(q, controller.signal);
      if (!controller.signal.aborted) {
        setResults(found);
        setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pick = useCallback(
    async (suggestion: PlaceSuggestion) => {
      haptics.selection();
      setResolving(suggestion.id);
      const resolved = await resolvePlace(suggestion);
      setResolving(null);
      setResults([]);
      setQuery('');

      if (!resolved) {
        // The details lookup failed. Keep the name so the field is still useful;
        // the event just has no pin, which is the same as never searching.
        onChange({ ...value, location: suggestion.name || value.location });
        return;
      }

      onChange({
        location: resolved.name || value.location || resolved.address,
        address: resolved.address,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        placeId: resolved.placeId,
      });
    },
    [onChange, value],
  );

  const clearPin = useCallback(() => {
    haptics.selection();
    onChange({
      location: value.location,
      latitude: undefined,
      longitude: undefined,
      placeId: undefined,
      address: undefined,
    });
  }, [onChange, value.location]);

  return (
    <View className="gap-3">
      <TextField
        label={label}
        value={value.location}
        placeholder={placeholder}
        icon={MapPin}
        onChangeText={(next) =>
          // Editing the words invalidates the pin. See the component note.
          onChange(
            pinned
              ? {
                  location: next,
                  latitude: undefined,
                  longitude: undefined,
                  placeId: undefined,
                  address: undefined,
                }
              : { ...value, location: next },
          )
        }
      />

      <TextField
        value={query}
        placeholder="Search for a place to pin it on the map"
        icon={Search}
        autoCorrect={false}
        onChangeText={onQueryChange}
      />

      {searching && (
        <View className="flex-row items-center gap-2 px-1">
          <Spinner size={14} />
          <Text variant="caption" className="text-muted-foreground">
            Searching...
          </Text>
        </View>
      )}

      {results.length > 0 && (
        <View
          className="overflow-hidden"
          style={{
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.10)',
            backgroundColor: 'rgba(255,255,255,0.03)',
          }}
        >
          {results.map((suggestion, index) => (
            <PressableFade
              key={suggestion.id}
              onPress={() => void pick(suggestion)}
              disabled={resolving !== null}
              accessibilityRole="button"
              accessibilityLabel={`${suggestion.name}, ${suggestion.address}`}
              className="flex-row items-start gap-2.5 px-3.5 py-3"
              style={
                index > 0
                  ? {
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(255,255,255,0.06)',
                    }
                  : undefined
              }
            >
              {resolving === suggestion.id ? (
                <Spinner size={15} />
              ) : (
                <MapPin size={15} color={brand.purple} />
              )}
              <View className="flex-1">
                <Text variant="label" numberOfLines={1}>
                  {suggestion.name}
                </Text>
                <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
                  {suggestion.address}
                </Text>
              </View>
            </PressableFade>
          ))}
        </View>
      )}

      {pinned ? (
        <View
          className="overflow-hidden"
          style={{
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: `${accents.green}44`,
          }}
        >
          {preview && (
            <Image
              source={{ uri: preview }}
              contentFit="cover"
              transition={200}
              style={{ width: '100%', height: 120 }}
              accessibilityLabel="Map preview"
            />
          )}
          <View className="flex-row items-start gap-2.5 p-3">
            <Check size={15} color={accents.green} />
            <View className="flex-1">
              <Text variant="label">Pinned on the map</Text>
              <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                {value.address}
              </Text>
            </View>
            <PressableFade
              onPress={clearPin}
              accessibilityRole="button"
              accessibilityLabel="Remove pin"
              className="flex-row items-center gap-1 px-2 py-1"
            >
              <X size={13} color="rgba(255,255,255,0.55)" />
              <Text variant="caption" className="text-muted-foreground">
                Remove
              </Text>
            </PressableFade>
          </View>
        </View>
      ) : (
        <Text variant="caption" className="px-1 text-muted-foreground">
          Optional - a pinned location gets a map and directions on the event
          screen. Searching uses{' '}
          {geocoderName() === 'google' ? 'Google Places' : 'OpenStreetMap'}.
        </Text>
      )}
    </View>
  );
}
