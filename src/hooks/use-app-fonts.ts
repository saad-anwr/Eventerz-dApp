/**
 * Loads the three brand families used by the web app. Returns `true` once the
 * app can render text without a fallback-font flash.
 *
 * Each weight is imported from its own subpath rather than the package root:
 * the root index re-exports every weight *and* italic, which drags ~30 unused
 * TTFs into the bundle.
 */

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

/**
 * How long to wait for fonts before giving up and rendering anyway.
 *
 * Generous, because on a first launch these are real files being fetched and a
 * slow device on a slow connection is not a failure. Short enough that nobody
 * sits looking at a logo wondering whether the app is broken.
 */
const FONT_TIMEOUT_MS = 6000;

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
  });

  /*
   * The timeout is the important part, and it was missing.
   *
   * `useFonts` reports two outcomes, loaded and failed, and the caller already
   * treated a failure as "carry on with system type". What it does not report is
   * the third outcome: never settling at all. `expo-font` has no internal
   * timeout, so an asset request that stalls - a dropped connection mid-fetch, a
   * dev server that goes away, a corrupt cache entry - leaves this hook
   * returning false forever.
   *
   * That single boolean gates `appReady` in the root layout, which holds the
   * native splash. So a stalled font request is not a missing typeface, it is an
   * app that never opens: no error, no spinner, no way out but force-quit. It
   * was reproduced on the emulator, sitting on the logo indefinitely while the
   * bundle had loaded perfectly well.
   *
   * `preferencesReady` next to it already had a fallback for exactly this
   * reason. Fonts needed the same and did not have it.
   *
   * Rendering with the system family is a small, temporary cosmetic cost; the
   * real font swaps in as soon as it arrives, because `loaded` flipping to true
   * re-renders anyway.
   */
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded || error) return undefined;
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, error]);

  return loaded || Boolean(error) || timedOut;
}
