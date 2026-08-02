/**
 * Runtime machine translation.
 *
 * # The shape of this
 *
 * Copy stays English in the source. Every string that reaches the screen goes
 * through `<Text>`, which asks this module for a translation. A miss returns the
 * English immediately and queues a fetch; when the answer arrives the cache is
 * updated and subscribers re-render. Nothing ever blocks on the network, so the
 * worst case is English for a moment rather than an empty screen.
 *
 * That trade is deliberate. The alternative - suspending until translations
 * resolve - turns every navigation into a spinner the first time a language is
 * used, on a screen the user has already seen render instantly in English.
 *
 * # Why requests are batched
 *
 * A screen mounts fifty strings in one frame. Fifty HTTP requests to a public
 * endpoint is how you get rate-limited into failing at exactly the moment the
 * user is watching. They are collected for a tick and sent as one array.
 *
 * # Provider
 *
 * Chosen in `providers.ts`. MyMemory by default - free, keyless, and therefore
 * working with no setup at all - and LibreTranslate whenever
 * `EXPO_PUBLIC_TRANSLATE_URL` names one, which is what a launch should use. The
 * quota trade-off between the two is documented there.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { SOURCE_LANGUAGE } from './languages';
import { quotaExhausted, requestTranslations } from './providers';

/**
 * Always on.
 *
 * The default provider needs no key, so there is always something to translate
 * with - a language picker that silently did nothing was the bug this feature
 * exists to fix. `providers.ts` decides which one is in play and documents what
 * it costs.
 */
export const translationEnabled = (): boolean => true;

export { quotaExhausted } from './providers';

const CACHE_PREFIX = 'eventerz.i18n.';

/** `language -> (english -> translated)`. */
const memory = new Map<string, Map<string, string>>();

type Listener = () => void;
const listeners = new Set<Listener>();

/** Re-render anything showing a string once new translations land. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const notify = () => listeners.forEach((l) => l());

function bucket(language: string): Map<string, string> {
  let found = memory.get(language);
  if (!found) {
    found = new Map();
    memory.set(language, found);
  }
  return found;
}

/**
 * Load a language's cache from disk.
 *
 * Worth persisting: the same few hundred strings are requested on every launch,
 * and re-fetching them is both slow and, on a metered provider, billable for no
 * benefit. Corrupt or unreadable cache is treated as empty rather than fatal.
 */
export async function hydrateCache(language: string): Promise<void> {
  if (language === SOURCE_LANGUAGE) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + language);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const target = bucket(language);
    for (const [k, v] of Object.entries(parsed)) target.set(k, v);
    notify();
  } catch {
    // A bad cache is not worth failing a launch over.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced: a screen resolving fifty strings should write disk once. */
function schedulePersist(language: string) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const target = memory.get(language);
    if (!target) return;
    void AsyncStorage.setItem(
      CACHE_PREFIX + language,
      JSON.stringify(Object.fromEntries(target)),
    ).catch(() => undefined);
  }, 1_000);
}

/* ------------------------------------------------------------------ queue -- */

let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeLanguage = SOURCE_LANGUAGE;

/** Bounded so one screen cannot post a megabyte of strings in a single call. */
const MAX_BATCH = 60;

async function flush() {
  flushTimer = null;
  const language = activeLanguage;
  const batch = Array.from(pending).slice(0, MAX_BATCH);
  pending = new Set(Array.from(pending).slice(MAX_BATCH));

  if (batch.length === 0 || language === SOURCE_LANGUAGE) return;

  /*
   * Failures are deliberately silent and not retried in place.
   *
   * The screen already reads correctly in English, so an error over working
   * copy is noise - and retrying a failing provider on every render is how a
   * rate limit becomes permanent. Nothing is cached for a string that failed,
   * so a later navigation asks again naturally.
   */
  const translated = await requestTranslations(batch, language);
  if (translated.size === 0) return;

  const target = bucket(language);
  for (const [source, value] of translated) target.set(source, value);

  schedulePersist(language);
  notify();

  if (pending.size > 0) flushTimer = setTimeout(flush, 50);
}

function enqueue(text: string) {
  pending.add(text);
  if (!flushTimer) flushTimer = setTimeout(flush, 50);
}

/* ----------------------------------------------------------------- public -- */

export function setActiveLanguage(language: string) {
  activeLanguage = language;
  void hydrateCache(language);
}

/**
 * The translation of `text`, or `text` itself while one is being fetched.
 *
 * Synchronous on purpose - it is called from render.
 */
export function translate(text: string, language: string): string {
  if (
    language === SOURCE_LANGUAGE ||
    !translationEnabled() ||
    !text ||
    // Numbers, addresses, symbols: nothing a translator would change, and
    // sending them wastes quota and risks mangling a wallet address.
    !/[a-zA-Z]{2}/.test(text)
  ) {
    return text;
  }

  const hit = bucket(language).get(text);
  if (hit) return hit;

  enqueue(text);
  return text;
}
