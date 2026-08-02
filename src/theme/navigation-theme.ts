/**
 * React Navigation theme so native stack backgrounds and headers match the app
 * instead of flashing the default near-black on every push.
 *
 * Note: Expo Router 57 vendors React Navigation - there is no standalone
 * `@react-navigation/native` package to import from. `Theme`, `DarkTheme` and
 * `ThemeProvider` all come from `expo-router`.
 *
 * Built per scheme rather than exported as a constant: the flash this exists to
 * prevent is worse in light mode, where the default dark background would show
 * for a frame on every push as a black rectangle.
 */

import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { brand } from './colors';
import { palettes, type ColorScheme } from './palettes';
import { fontFamily } from './typography';

const fonts = {
  regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
  medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
  bold: { fontFamily: fontFamily.semibold, fontWeight: '600' },
  heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
} as const;

export function navigationThemeFor(scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = palettes[scheme];

  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: brand.purple,
      background: palette.background,
      card: scheme === 'dark' ? brand.bgSoft : palette.card,
      text: palette.foreground,
      border: palette.border,
      notification: brand.cyan,
    },
    fonts: fonts as Theme['fonts'],
  };
}

/** Dark, for anything rendering before the provider resolves a preference. */
export const eventerzNavigationTheme = navigationThemeFor('dark');
