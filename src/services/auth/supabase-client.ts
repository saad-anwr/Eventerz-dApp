/**
 * Supabase client for React Native.
 *
 * Three things differ from the web client:
 *
 *  1. **Storage.** There is no browser localStorage. The session (which holds a
 *     refresh token) goes to expo-secure-store, not AsyncStorage - it is a
 *     bearer credential and belongs in the Keystore/Keychain.
 *  2. **detectSessionInUrl: false.** There is no URL bar; the deep-link handler
 *     in `auth-service.ts` completes the OAuth exchange instead.
 *  3. **URL polyfill.** supabase-js builds request URLs with `URL`/
 *     `URLSearchParams`, which Hermes only partially implements.
 *
 * Returns `null` when unconfigured so the app keeps running on mock data.
 */

import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { integrationsConfig } from '@/constants/config';
import { secureStorage } from '@/utils/storage';

import type { Database } from './types';

/** True once a Supabase project is configured via env. */
export const isSupabaseConfigured =
  integrationsConfig.supabaseUrl.length > 0 &&
  integrationsConfig.supabaseAnonKey.length > 0;

/**
 * SecureStore has a 2048-byte value limit on some Android devices, and a
 * Supabase session can exceed it once the JWT carries custom claims. Chunking
 * keeps large sessions storable rather than silently failing to persist.
 */
const CHUNK_SIZE = 1800;

const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await secureStorage.get(key);
    if (head === null) return null;

    // Non-chunked value.
    if (!head.startsWith('__chunks__:')) return head;

    const count = Number(head.slice('__chunks__:'.length));
    if (!Number.isFinite(count)) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await secureStorage.get(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await secureStorage.set(key, value);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_SIZE);
    await secureStorage.set(key, `__chunks__:${count}`);
    for (let i = 0; i < count; i++) {
      await secureStorage.set(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    const head = await secureStorage.get(key);
    if (head?.startsWith('__chunks__:')) {
      const count = Number(head.slice('__chunks__:'.length));
      for (let i = 0; i < count; i++) {
        await secureStorage.remove(`${key}.${i}`);
      }
    }
    await secureStorage.remove(key);
  },
};

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

  client ??= createClient<Database>(
    integrationsConfig.supabaseUrl,
    integrationsConfig.supabaseAnonKey,
    {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL bar on native - the deep-link handler does the exchange.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    },
  );

  return client;
}
