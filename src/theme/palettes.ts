/**
 * Light and dark surface palettes.
 *
 * # Why this is a separate file from `colors.ts`
 *
 * `colors.ts` holds what does *not* change with the theme - the brand hues, the
 * gradients, the cover palettes. A purple logo is purple on both. What changes
 * is everything describing a surface: page, card, border, and the text sitting
 * on them. Keeping the two apart is what stops a theme switch from quietly
 * recolouring the brand.
 *
 * # The overlays are the part that is easy to get wrong
 *
 * Half this design is `rgba(255,255,255,0.06)` glass and hairlines. Those are
 * white *because the page underneath is nearly black* - they lighten. Drop the
 * same values onto a white page and they do nothing at all: the borders vanish,
 * every card loses its edge, and the result reads as a broken stylesheet rather
 * than a light theme. So the light palette inverts them to black at a lower
 * opacity, which is what "a subtle edge" means on a light surface.
 */

/** Everything a surface needs, in one shape both palettes satisfy. */
export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  secondary: string;
  secondaryForeground: string;
  /** A surface tint. Never a text colour - see the note in `tailwind.config`. */
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  /** Hairlines and glass, tuned to the surface they sit on. */
  hairline: string;
  hairlineStrong: string;
  glass: string;
  glassStrong: string;
  /** Scrims that keep text legible over imagery. */
  scrim: string;
  scrimDeep: string;
  /** Status-bar content: light text on dark chrome, and the reverse. */
  statusBarStyle: 'light' | 'dark';
}

export const darkPalette: Palette = {
  background: '#050816',
  foreground: '#f8fafc',
  card: '#0b0e1e',
  cardForeground: '#f8fafc',
  secondary: '#151d32',
  secondaryForeground: '#f8fafc',
  muted: '#191f2e',
  mutedForeground: '#94a2b8',
  border: '#20273c',
  input: '#20273c',
  hairline: 'rgba(255,255,255,0.10)',
  hairlineStrong: 'rgba(255,255,255,0.18)',
  glass: 'rgba(255,255,255,0.03)',
  glassStrong: 'rgba(255,255,255,0.06)',
  scrim: 'rgba(5,8,22,0.72)',
  scrimDeep: 'rgba(0,0,0,0.60)',
  statusBarStyle: 'light',
};

export const lightPalette: Palette = {
  /*
   * Not pure white. `#f7f8fc` carries a trace of the brand's blue, which keeps
   * white cards reading as raised surfaces rather than dissolving into the
   * page - the same job `#0b0e1e` does against `#050816` in the dark palette.
   */
  background: '#f7f8fc',
  foreground: '#0b1024',
  card: '#ffffff',
  cardForeground: '#0b1024',
  secondary: '#eceef6',
  secondaryForeground: '#0b1024',
  muted: '#e8eaf2',
  /*
   * Deliberately dark enough to pass contrast on `#ffffff`. The dark palette's
   * `#94a2b8` is 2.9:1 here, which fails AA for body text - a straight reuse
   * would have made every caption in the app unreadable in light mode.
   */
  mutedForeground: '#525c73',
  border: '#dfe3ee',
  input: '#dfe3ee',
  // Inverted: on a light page an overlay has to darken to be visible at all.
  hairline: 'rgba(11,16,36,0.10)',
  hairlineStrong: 'rgba(11,16,36,0.18)',
  glass: 'rgba(11,16,36,0.03)',
  glassStrong: 'rgba(11,16,36,0.06)',
  scrim: 'rgba(247,248,252,0.78)',
  scrimDeep: 'rgba(11,16,36,0.45)',
  statusBarStyle: 'dark',
};

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

/**
 * The palette as NativeWind CSS variables.
 *
 * NativeWind resolves `bg-background` through `var(--color-background)`, so
 * setting these on a root view re-themes every Tailwind class in the tree
 * without a single `dark:` variant at the call site. Inline `style={{...}}`
 * cannot read a CSS variable, which is what `useThemeColors()` is for.
 */
export function paletteVars(scheme: ColorScheme): Record<string, string> {
  const p = palettes[scheme];
  return {
    '--color-background': p.background,
    '--color-foreground': p.foreground,
    '--color-card': p.card,
    '--color-card-foreground': p.cardForeground,
    '--color-secondary': p.secondary,
    '--color-secondary-foreground': p.secondaryForeground,
    '--color-muted': p.muted,
    '--color-muted-foreground': p.mutedForeground,
    '--color-border': p.border,
    '--color-input': p.input,
  };
}
