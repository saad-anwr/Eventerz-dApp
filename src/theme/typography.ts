/**
 * Typography scale.
 *
 * The web app pairs Space Grotesk (display) with Inter (body) and JetBrains
 * Mono (addresses / signatures). We load the same three families so headings
 * read identically across web and mobile.
 */

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
} as const;

/**
 * Type ramp. `size` is the base value - screens scale it with the OS font
 * setting via `useScaledFont`, so nothing here is hard-locked.
 */
export const type = {
  display: { size: 34, lineHeight: 40, family: fontFamily.displayBold },
  h1: { size: 28, lineHeight: 34, family: fontFamily.displayBold },
  h2: { size: 22, lineHeight: 28, family: fontFamily.display },
  h3: { size: 18, lineHeight: 24, family: fontFamily.display },
  title: { size: 16, lineHeight: 22, family: fontFamily.semibold },
  body: { size: 15, lineHeight: 22, family: fontFamily.regular },
  bodySm: { size: 13, lineHeight: 19, family: fontFamily.regular },
  label: { size: 12, lineHeight: 16, family: fontFamily.medium },
  caption: { size: 11, lineHeight: 15, family: fontFamily.regular },
  micro: { size: 10, lineHeight: 13, family: fontFamily.medium },
} as const;

export type TypeToken = keyof typeof type;
