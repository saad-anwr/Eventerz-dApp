/**
 * How many modal surfaces are currently open.
 *
 * # Why a counter and not a boolean
 *
 * Sheets and dialogs can legitimately stack - a confirmation opened from inside
 * a sheet - and a boolean would be cleared by whichever one closed first,
 * bringing the tab bar back underneath the one still open. A count only reaches
 * zero when the last surface has gone.
 *
 * # What it is for
 *
 * The tab bar hides while anything modal is open. That started as a drawing
 * problem and turned out to be a behaviour problem too.
 *
 * The drawing problem: on Android, `elevation` orders siblings within a parent.
 * A sheet lives deep inside the navigator's screen container and the tab bar is
 * a sibling *of that container*, so nothing set on the sheet can lift it above
 * the bar - the bottom of every sheet was covered, which buried the
 * "Don't have a wallet? Get one" link where it could not be read or tapped.
 *
 * The behaviour problem: the tab bar underneath stayed tappable, so a
 * "confirmation" dialog could be walked away from by switching tabs while it
 * was still on screen.
 *
 * Removing the bar for the duration fixes both, and is what a modal surface is
 * supposed to mean. The alternative - rendering sheets in a real `Modal`
 * window - is the more orthodox fix and was tried first; it puts the sheet in a
 * separate Android window, which leaves the toast host behind it (so the
 * "Connection failed" toast, the single most likely thing a user sees here,
 * became invisible) and changes soft-keyboard handling for the amount field in
 * the send sheet. Both are worse than the bug being fixed.
 */

import { create } from 'zustand';

interface OverlayState {
  count: number;
  open: () => void;
  close: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  count: 0,
  open: () => set((s) => ({ count: s.count + 1 })),
  // Floored at zero: a double-close must not push the count negative, which
  // would leave the tab bar hidden until another surface opened and closed.
  close: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

/** True while any sheet or dialog is on screen. */
export const useOverlayOpen = (): boolean =>
  useOverlayStore((s) => s.count > 0);
