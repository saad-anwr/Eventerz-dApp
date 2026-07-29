/**
 * Spacing, radii, shadows and motion constants.
 *
 * The 4px spacing grid matches Tailwind's default scale used on the web app,
 * so `gap-3` on web and `spacing[3]` here describe the same rhythm.
 */

import { Platform } from 'react-native';

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

/** Horizontal gutter every screen shares. */
export const screenPadding = spacing[5];

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  full: 999,
} as const;

/** Minimum interactive size — WCAG 2.5.5 / Android accessibility guidance. */
export const TOUCH_TARGET = 44;

export const TAB_BAR_HEIGHT = 62;

/**
 * Elevation presets.
 *
 * Three platforms, three mechanisms:
 *  - iOS keeps the tinted `shadow*` props, which is the only way to get a
 *    coloured spread there.
 *  - Android has no coloured shadow, so `elevation` stands in.
 *  - Web uses `boxShadow`; React Native Web deprecated the `shadow*` props and
 *    warns on every one of them.
 */
function elevation(color: string, opacity: number, radius: number, y: number) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
    },
    android: { elevation: Math.round(radius / 3), shadowColor: color },
    default: {
      boxShadow: `0px ${y}px ${radius}px rgba(${hexToRgb(color)}, ${opacity})`,
    },
  });
}

/** `#9945ff` → `153,69,255`, for composing rgba() strings on web. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export const shadow = {
  card: elevation('#000000', 0.5, 24, 10),
  glow: elevation('#9945ff', 0.55, 26, 8),
  glowCyan: elevation('#22d3ee', 0.45, 22, 6),
} as const;

/** Ad-hoc elevation for one-off surfaces — same platform handling as above. */
export const makeShadow = elevation;

/**
 * Motion tokens. `emphasized` is the web app's `[0.22, 1, 0.36, 1]` easing
 * curve — the one Framer Motion uses for modals and card reveals.
 */
export const motion = {
  duration: {
    instant: 120,
    fast: 200,
    normal: 300,
    slow: 450,
    deliberate: 700,
  },
  /** Cubic-bezier control points, consumed via Reanimated's `Easing.bezier`. */
  easing: {
    emphasized: [0.22, 1, 0.36, 1] as const,
    standard: [0.4, 0, 0.2, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  spring: {
    /** Default for press feedback and layout shifts. */
    gentle: { damping: 18, stiffness: 180, mass: 1 },
    /** Snappier — bottom sheets, tab indicator. */
    snappy: { damping: 22, stiffness: 260, mass: 0.9 },
    /** Bouncy — success states, counters. */
    bouncy: { damping: 12, stiffness: 220, mass: 0.8 },
  },
} as const;
