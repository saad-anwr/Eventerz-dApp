/**
 * React Navigation theme so native stack backgrounds and headers match the app
 * instead of flashing the default near-black on every push.
 *
 * Note: Expo Router 57 vendors React Navigation - there is no standalone
 * `@react-navigation/native` package to import from. `Theme`, `DarkTheme` and
 * `ThemeProvider` all come from `expo-router`.
 */

import { DarkTheme, type Theme } from 'expo-router';

import { brand, surface } from './colors';
import { fontFamily } from './typography';

export const eventerzNavigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: brand.purple,
    background: brand.bg,
    card: brand.bgSoft,
    text: surface.foreground,
    border: surface.border,
    notification: brand.cyan,
  },
  fonts: {
    regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
    medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
    bold: { fontFamily: fontFamily.semibold, fontWeight: '600' },
    heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
  },
};
