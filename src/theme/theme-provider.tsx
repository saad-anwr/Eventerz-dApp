/**
 * Theme provider.
 *
 * Resolves the stored preference (`light` | `dark` | `system`) into a concrete
 * scheme, publishes it two ways, and keeps them in step:
 *
 *   - as NativeWind CSS variables on a root view, so every `bg-card`,
 *     `text-foreground` and `border-border` in the app re-themes with no
 *     `dark:` variant at any call site;
 *   - as a plain object from `useThemeColors()`, for the ~190 places that pass
 *     a colour to an inline `style` or to an icon's `color` prop, neither of
 *     which can read a CSS variable.
 *
 * Both read the same palette, so they cannot disagree.
 *
 * # Why the theme was previously a dead control
 *
 * `setTheme` wrote to the preferences store and nothing ever read it back - the
 * only consumer was the Settings screen highlighting the selected chip. The app
 * had a toast admitting as much ("Dark mode only for now"). The colours were
 * not the obstacle; the missing piece was somewhere for a scheme to live and a
 * way for a static `#94a2b8` to become reactive.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme, View } from 'react-native';
import { vars } from 'nativewind';

import { setActiveLanguage } from '@/i18n/translate';
import { usePreferencesStore } from '@/store/preferences-store';

import { palettes, paletteVars, type ColorScheme, type Palette } from './palettes';

interface ThemeValue {
  /** The scheme actually in effect, with `system` already resolved. */
  scheme: ColorScheme;
  colors: Palette;
}

/*
 * Defaults to dark rather than throwing when read outside the provider. A
 * missing provider should not be able to take out a screen over a colour, and
 * dark is what the app looked like before this existed.
 */
const ThemeContext = createContext<ThemeValue>({
  scheme: 'dark',
  colors: palettes.dark,
});

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** The active palette. The common case, so it gets the short name. */
export function useThemeColors(): Palette {
  return useContext(ThemeContext).colors;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePreferencesStore((s) => s.theme);
  const language = usePreferencesStore((s) => s.language);

  /*
   * Tell the translation layer which language is active and load its cached
   * strings from disk. Here rather than in its own provider only because this
   * is already the one component wrapping the whole tree that reads
   * preferences - a second identical provider would be ceremony.
   */
  useEffect(() => {
    setActiveLanguage(language || 'en');
  }, [language]);

  /*
   * `useColorScheme` from react-native, not from nativewind: this is the
   * *device* setting, which is the input to `system`. NativeWind's hook reports
   * what NativeWind currently believes, which is the value being computed here
   * - reading it would be circular.
   */
  const systemScheme = useSystemColorScheme();

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: palettes[scheme] }),
    [scheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/*
        The variables have to sit on a view that wraps the tree, not on the
        Tailwind config - which is static and compiled. `flex-1` because this
        view is now the app's layout root and a default-height wrapper would
        collapse every screen inside it to nothing.
      */}
      <View style={[{ flex: 1 }, vars(paletteVars(scheme))]}>{children}</View>
    </ThemeContext.Provider>
  );
}
