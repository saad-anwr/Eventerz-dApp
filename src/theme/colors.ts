/**
 * Eventerz colour tokens.
 *
 * Single source of truth for anything that cannot go through a Tailwind class
 * — gradient stops, shadow colours, SVG fills, status-bar tint, navigation
 * theme. Values are byte-identical to the web app's `tailwind.config.ts` and
 * the HSL tokens in `app/globals.css`.
 */

export const brand = {
  bg: '#050816',
  bgSoft: '#0a0f24',
  purple: '#9945ff',
  violet: '#7c3aed',
  blue: '#2f80ff',
  cyan: '#22d3ee',
  green: '#14f195',
} as const;

export const surface = {
  background: '#050816',
  foreground: '#f8fafc',
  card: '#0b0e1e',
  secondary: '#151d32',
  muted: '#191f2e',
  mutedForeground: '#94a2b8',
  accent: '#3ebaf4',
  border: '#20273c',
} as const;

/** Semi-transparent overlays used for glass surfaces and hairlines. */
export const alpha = {
  hairline: 'rgba(255,255,255,0.10)',
  hairlineStrong: 'rgba(255,255,255,0.18)',
  glass: 'rgba(255,255,255,0.03)',
  glassStrong: 'rgba(255,255,255,0.06)',
  scrim: 'rgba(5,8,22,0.72)',
  scrimDeep: 'rgba(0,0,0,0.60)',
} as const;

/** Semantic status colours (reuses brand hues so nothing feels bolted on). */
export const status = {
  success: brand.green,
  info: brand.blue,
  warning: '#fbbf24',
  danger: '#f87171',
  live: brand.green,
} as const;

/**
 * The signature Eventerz gradient — `linear-gradient(135deg, …)` on web.
 * On native, feed `colors` to `<LinearGradient>` with `start`/`end` of
 * `{x:0,y:0}` → `{x:1,y:1}` to reproduce the 135° angle.
 */
export const gradients = {
  brand: {
    colors: [brand.purple, brand.blue, brand.cyan] as const,
    locations: [0, 0.45, 1] as const,
  },
  brandSoft: {
    colors: [
      'rgba(153,69,255,0.22)',
      'rgba(47,128,255,0.16)',
      'rgba(34,211,238,0.20)',
    ] as const,
    locations: [0, 0.5, 1] as const,
  },
  violet: {
    colors: [brand.violet, brand.purple] as const,
    locations: [0, 1] as const,
  },
  cyanGreen: {
    colors: [brand.cyan, brand.green] as const,
    locations: [0, 1] as const,
  },
  /** Top-down fade used to keep hero text legible over imagery. */
  scrim: {
    colors: ['transparent', 'rgba(5,8,22,0.65)', brand.bg] as const,
    locations: [0, 0.55, 1] as const,
  },
  /** Sheen swept across skeletons and NFT ticket cards. */
  sheen: {
    colors: [
      'rgba(255,255,255,0)',
      'rgba(255,255,255,0.10)',
      'rgba(255,255,255,0)',
    ] as const,
    locations: [0, 0.5, 1] as const,
  },
} as const;

/**
 * Named cover gradients for events and avatars. Keys are stored on the data
 * model (`EventItem.coverGradient`) exactly like the web app stores Tailwind
 * class strings — the key is portable, the colours resolve per-platform.
 */
export const coverGradients = {
  'purple-blue': [brand.purple, brand.blue],
  'blue-cyan': [brand.blue, brand.cyan],
  'cyan-green': [brand.cyan, brand.green],
  'violet-purple': [brand.violet, brand.purple],
  'fuchsia-purple': ['#d946ef', brand.purple],
  'indigo-blue': ['#6366f1', brand.blue],
  'green-cyan': [brand.green, brand.cyan],
  'sky-cyan': ['#0ea5e9', brand.cyan],
} as const;

export type CoverGradientKey = keyof typeof coverGradients;

export const coverGradientKeys = Object.keys(
  coverGradients,
) as CoverGradientKey[];

/** Resolve a gradient key to its colour stops, falling back to the brand pair. */
export function resolveCoverGradient(key: string): readonly [string, string] {
  const found = coverGradients[key as CoverGradientKey];
  return (found ?? coverGradients['purple-blue']) as readonly [string, string];
}

/** Accent hues referenced by feature/community data (mirrors web `accent`). */
export const accents = {
  purple: brand.purple,
  blue: brand.blue,
  cyan: brand.cyan,
  green: brand.green,
} as const;

export type AccentKey = keyof typeof accents;
