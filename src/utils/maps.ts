/**
 * Map URLs for an event's location.
 *
 * Ported from the website's `lib/maps.ts`, with one deliberate difference: the
 * app renders a **static map image** rather than an embedded map, and links out
 * to the native Maps app.
 *
 * Why not `react-native-maps`: it is a native module. Adding it means a config
 * plugin, a prebuild and a fresh Gradle run - 17 minutes on this machine - and
 * ships a full interactive map engine to draw a picture with one pin in it. A
 * static image loads instantly with `expo-image`, needs no rebuild, and the one
 * thing a user actually wants to do with an event's map - get directions - is
 * better served by handing off to Google Maps, which already knows where they
 * are and how they travel.
 *
 * Everything degrades without a key. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` gets you
 * the image; without it the card shows the address and the same link-out, which
 * needs no key at all because `maps.google.com/?api=1` is a documented public
 * URL scheme.
 */

export interface MappableLocation {
  /** The host's own display string. Always present. */
  location: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  /** Formatted address from the geocoder, when there was one. */
  address?: string;
  isOnline?: boolean;
}

export const googleMapsApiKey = (): string =>
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export const hasGoogleMapsKey = (): boolean => googleMapsApiKey().length > 0;

/** Coordinates, when the pair is complete and finite. */
export function coordinatesOf(
  place: MappableLocation,
): { lat: number; lng: number } | null {
  const { latitude, longitude } = place;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

/**
 * A flat map image, or null when one cannot be produced.
 *
 * `scale=2` for retina; `size` is in CSS-ish points, so the delivered image is
 * twice these dimensions. The marker is brand purple so the pin reads as part
 * of the app rather than a Google default.
 */
export function staticMapUrl(
  place: MappableLocation,
  options?: { width?: number; height?: number; zoom?: number },
): string | null {
  const key = googleMapsApiKey();
  const coords = coordinatesOf(place);
  if (!key || !coords) return null;

  const params = new URLSearchParams({
    key,
    center: `${coords.lat},${coords.lng}`,
    zoom: String(options?.zoom ?? 15),
    size: `${options?.width ?? 640}x${options?.height ?? 240}`,
    scale: '2',
    maptype: 'roadmap',
    markers: `color:0x9945FF|${coords.lat},${coords.lng}`,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * A link that opens the location in the native Maps app.
 *
 * `?api=1` is documented, keyless and stable, and both Google Maps and Apple
 * Maps resolve it on their platform. The older `maps.google.com/maps?q=` form
 * still works but is not guaranteed to.
 */
export function mapLinkUrl(place: MappableLocation): string {
  const coords = coordinatesOf(place);
  const params = new URLSearchParams({ api: '1' });

  if (coords) {
    params.set('query', `${coords.lat},${coords.lng}`);
    // With both, Maps pins the exact place rather than the nearest match to the
    // coordinates - which for a building in a dense block is a different door.
    if (place.placeId) params.set('query_place_id', place.placeId);
  } else {
    params.set('query', place.address || place.location);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** Turn-by-turn from wherever the user is. */
export function directionsUrl(place: MappableLocation): string {
  const coords = coordinatesOf(place);
  const params = new URLSearchParams({ api: '1' });
  params.set(
    'destination',
    coords ? `${coords.lat},${coords.lng}` : place.address || place.location,
  );
  if (place.placeId) params.set('destination_place_id', place.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Pull the mappable fields off an event, so screens do not repeat the shape. */
export function locationOf(event: {
  location: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
  isOnline: boolean;
}): MappableLocation {
  return {
    location: event.location,
    latitude: event.latitude,
    longitude: event.longitude,
    placeId: event.placeId,
    address: event.address,
    isOnline: event.isOnline,
  };
}
