/**
 * Deterministic gradient avatars — ported from the web app's `lib/avatar.ts`.
 * The same seed produces the same gradient on web and mobile.
 */

import { coverGradientKeys, type CoverGradientKey } from '@/theme/colors';

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Stable gradient key for a seed string (user id, event id, wallet address). */
export function avatarGradient(seed: string): CoverGradientKey {
  return coverGradientKeys[hash(seed) % coverGradientKeys.length];
}

/** Up to two initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic pick from any list — used for mock variety. */
export function pickBySeed<T>(seed: string, list: readonly T[]): T {
  return list[hash(seed) % list.length];
}
