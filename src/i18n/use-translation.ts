/**
 * The hook `<Text>` uses, and the one to reach for anywhere a string is built
 * outside a `<Text>` (a toast title, an accessibility label, an Alert).
 */

import { useSyncExternalStore } from 'react';

import { usePreferencesStore } from '@/store/preferences-store';

import { SOURCE_LANGUAGE } from './languages';
import { subscribe, translate } from './translate';

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

export function useTranslate(): (text: string) => string {
  const language = usePreferencesStore((s) => s.language);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (text: string) => translate(text, language);
}

/** The active language code. */
export function useLanguage(): string {
  return usePreferencesStore((s) => s.language) || SOURCE_LANGUAGE;
}
