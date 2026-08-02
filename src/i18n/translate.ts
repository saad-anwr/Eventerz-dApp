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
 * LibreTranslate's request shape, because it is open, self-hostable, and needs
 * no key for a private instance - so nothing here forces a billing relationship
 * to run the app. `EXPO_PUBLIC_TRANSLATE_URL` points it at your own instance;
 * `EXPO_PUBLIC_TRANSLATE_API_KEY` is sent when set, for hosted plans.
 *
 * If neither is configured, translation is **off** and everything stays
 * English. That is the honest default: silently shipping every user's interface
 * copy to a third-party endpoint nobody configured is not a reasonable thing to
 * do by accident.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { SOURCE_LANGUAGE } from './languages';

const ENDPOINT = (process.env.EXPO_PUBLIC_TRANSLATE_URL ?? '').trim();
const API_KEY = (process.env.EXPO_PUBLIC_TRANSLATE_API_KEY ?? '').trim();

/** Translation is only attempted when an endpoint is configured. */
export const translationEnabled = (): boolean => /^https?:\/\//i.test(ENDPOINT);

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

  try {
    const response = await fetch(`${ENDPOINT.replace(/\/$/, '')}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: batch,
        source: SOURCE_LANGUAGE,
        target: language,
        format: 'text',
        ...(API_KEY ? { api_key: API_KEY } : {}),
      }),
    });
    if (!response.ok) throw new Error(`translate ${response.status}`);

    const body = (await response.json()) as { translatedText?: string | string[] };
    // The API returns an array for an array `q`, a string for a string.
    const out = Array.isArray(body.translatedText)
      ? body.translatedText
      : [body.translatedText ?? ''];

    const target = bucket(language);
    batch.forEach((source, i) => {
      const translated = out[i];
      if (typeof translated === 'string' && translated.length > 0) {
        target.set(source, translated);
      }
    });

    schedulePersist(language);
    notify();
  } catch {
    /*
     * Deliberately silent, and deliberately not retried.
     *
     * The screen is already showing readable English. Surfacing "translation
     * failed" over working copy would be noise, and retrying a failing endpoint
     * on every render is how a rate limit becomes permanent. The strings stay
     * un-cached, so a later navigation naturally tries again.
     */
  }

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
