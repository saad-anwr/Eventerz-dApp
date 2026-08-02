/**
 * The hook `<Text>` uses, and the one to reach for anywhere a string is built
 * outside a `<Text>` (a toast title, an accessibility label, an Alert).
 */

import { useCallback, useSyncExternalStore } from 'react';

import { usePreferencesStore } from '@/store/preferences-store';

import { SOURCE_LANGUAGE } from './languages';
import { quotaExhausted, subscribe, translate } from './translate';

/**
 * A snapshot that changes whenever new translations land.
 *
 * `useSyncExternalStore` rather than an effect + state: the cache is mutated
 * outside React by the batch flush, and this is the sanctioned way to read a
 * mutable external source without tearing between renders.
 */
let version = 0;
const bump = () => (version += 1);
subscribe(bump);

const getSnapshot = () => version;

/**
 * The returned function's identity changes whenever new translations land, and
 * that is load-bearing rather than incidental.
 *
 * This project builds with React Compiler (`app.json` -> `experiments`), which
 * memoises `<Text>`'s content on `[children, t]`. Returning a fresh-but-
 * equivalent closure got compiled down to a stable one, so `t(children)` was
 * computed once and never again: translations arrived, all 73 subscribers
 * re-rendered, and every one of them redisplayed its cached English. The screen
 * only ever changed language by navigating to a screen that had not rendered
 * yet.
 *
 * `translate()` reads a module-level cache during render, which the compiler
 * cannot see. Threading the version through the dependency list is what turns
 * that hidden mutation into something it can.
 */
export function useTranslate(): (text: string) => string {
  const language = usePreferencesStore((s) => s.language);
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useCallback(
    (text: string) => translate(text, language, version),
    [language, version],
  );
}

/** The active language code. */
export function useLanguage(): string {
  return usePreferencesStore((s) => s.language) || SOURCE_LANGUAGE;
}

/**
 * Whether the provider has run out of quota, re-rendering when it happens.
 *
 * Reading `quotaExhausted()` straight from render would latch whatever it said
 * the first time: the flag flips mid-session and nothing else repaints the
 * component that explains it.
 */
export function useQuotaExhausted(): boolean {
  /*
   * `quotaExhausted` is the snapshot itself rather than something read after
   * the hook. Calling it in the body would let React Compiler treat a
   * zero-argument read of module state as a constant and keep answering
   * `false` forever - the same trap `useTranslate` documents. A value React
   * owns cannot be memoised away.
   */
  return useSyncExternalStore(subscribe, quotaExhausted, () => false);
}
