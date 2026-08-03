/**
 * Turning what a host typed into a place on a map.
 *
 * Ported from the website's `lib/geocode.ts`. Two providers behind one
 * interface, chosen by whether `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set:
 *
 *   • **Google Places (New)** - better results, costs money, needs a key.
 *   • **Nominatim (OpenStreetMap)** - free, keyless, no signup. Rate-limited to
 *     roughly one request a second by its usage policy, which is why callers
 *     debounce rather than searching on every keystroke.
 *
 * The fallback is not a degraded mode nobody should use: a fresh clone gets
 * working location search without anyone opening a Google Cloud console, and the
 * result shape is identical either way, so the picker never learns which one
 * answered.
 *
 * Geocoding is always optional. A host who types "Ayush's rooftop" and picks
 * nothing still publishes a valid event - `location` keeps their words and the
 * coordinates stay undefined. Requiring a resolvable address would make the
 * picker mandatory, which is the wrong trade for a product where half the events
 * are in someone's living room.
 */

export interface PlaceSuggestion {
  /** Stable id from whichever provider produced it. */
  id: string;
  /** Short name - "Ademzweb". */
  name: string;
  /** Full line - "B-272, Pocket B, Okhla Phase I, New Delhi, Delhi 110020". */
  address: string;
  /** Present immediately from Nominatim; needs a details call for Google. */
  latitude?: number;
  longitude?: number;
  /** Only Google has one. */
  placeId?: string;
}

export interface ResolvedPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

const key = () => process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

/**
 * The locales to ask a geocoder for, best first.
 *
 * Taken from the device rather than the app's chosen UI language: someone
 * running the interface in Spanish while living in India still wants Delhi
 * place names spelled the way the signs are, and the device locale is the only
 * signal that carries the region. English is appended as the fallback every
 * provider understands, so a name is never returned in a script the user has
 * no way to read.
 */
function deviceLanguages(): string {
  try {
    // Hermes ships a full-ICU `Intl`, so this needs no extra native module -
    // it resolves to something like `en-IN` on a phone set to English (India).
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    return locale && locale !== 'en' ? `${locale},en` : 'en';
  } catch {
    return 'en';
  }
}

export const geocoderName = (): 'google' | 'openstreetmap' =>
  key() ? 'google' : 'openstreetmap';

/**
 * Suggestions for a partial query.
 *
 * Returns an empty array rather than throwing on any provider failure. A
 * geocoder being down must not stop someone publishing an event - they can still
 * type an address, which is what the field did before this existed.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    return key() ? await searchGoogle(q, signal) : await searchNominatim(q, signal);
  } catch (error) {
    // An aborted request is the normal result of typing another character.
    if ((error as Error)?.name !== 'AbortError') {
      console.warn('[geocode] search failed', error);
    }
    return [];
  }
}

async function searchGoogle(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
    },
    body: JSON.stringify({ input: query }),
  });

  if (!response.ok) throw new Error(`Places autocomplete returned ${response.status}`);
  const payload = await response.json();

  return (payload.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      id: p.placeId,
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      address: p.structuredFormat?.secondaryText?.text ?? p.text?.text ?? '',
    }));
}

async function searchNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  /*
   * `accept-language` and `countrycodes` are what make this usable.
   *
   * Without them, searching "Saket Social" from Delhi returned two Thai
   * government offices written in Thai script - Nominatim had matched "social"
   * against สังคม in Sisaket province and, with nothing to prefer, ranked them
   * first. Two separate problems: results came back in a script the user
   * cannot read, and from the wrong side of the planet.
   *
   * `accept-language` fixes the script. The country bias fixes the ranking:
   * results are *preferred*, not restricted, so a search for a venue abroad
   * still finds it - `countrycodes` would have hidden it outright, which is
   * why this uses the viewbox-free soft form.
   *
   * `limit` is raised because the good match is often not in the first five
   * once a global query has pulled in noise.
   */
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '8',
    addressdetails: '1',
    'accept-language': deviceLanguages(),
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      signal,
      headers: {
        Accept: 'application/json',
        // Nominatim's policy requires an identifying User-Agent. A native
        // request has no browser to supply one, and anonymous traffic is what
        // gets an IP blocked.
        'User-Agent': 'Eventerz/1.0 (https://www.eventerz.xyz)',
      },
    },
  );
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  const rows = await response.json();
  return (rows as any[]).map((row) => {
    // `display_name` is the whole comma-separated chain; the first segment is
    // usually the venue or house number, which is what belongs in the title.
    const parts = String(row.display_name ?? '').split(',');
    return {
      id: `osm:${row.osm_type}:${row.osm_id}`,
      name: row.name || parts[0]?.trim() || query,
      address: String(row.display_name ?? ''),
      latitude: Number.parseFloat(row.lat),
      longitude: Number.parseFloat(row.lon),
    };
  });
}

/**
 * Turn a suggestion into coordinates.
 *
 * A no-op for Nominatim, which already returned them. Google's autocomplete
 * deliberately omits coordinates - they are a separate, separately-billed Place
 * Details call - so this runs only for the one suggestion the host picked.
 */
export async function resolvePlace(
  suggestion: PlaceSuggestion,
): Promise<ResolvedPlace | null> {
  if (
    typeof suggestion.latitude === 'number' &&
    typeof suggestion.longitude === 'number'
  ) {
    return {
      name: suggestion.name,
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      placeId: suggestion.placeId,
    };
  }

  if (!suggestion.placeId || !key()) return null;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': key(),
          // Required by Places (New), and what keeps this on the cheapest
          // billing tier - asking for photos or reviews here would silently cost
          // several times more per event created.
          'X-Goog-FieldMask': 'location,formattedAddress,displayName',
        },
      },
    );
    if (!response.ok) throw new Error(`Place details returned ${response.status}`);

    const place = await response.json();
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return {
      name: place.displayName?.text ?? suggestion.name,
      address: place.formattedAddress ?? suggestion.address,
      latitude: lat,
      longitude: lng,
      placeId: suggestion.placeId,
    };
  } catch (error) {
    console.warn('[geocode] resolve failed', error);
    return null;
  }
}
