/**
 * Storage facade.
 *
 * `storage` → AsyncStorage (bulk, non-sensitive, Zustand persistence).
 * `secureStorage` → expo-secure-store (Keystore / Keychain backed).
 *
 * Both degrade to no-ops rather than throwing, so a storage failure can never
 * take down a render. SecureStore is unavailable on web, where we fall back to
 * AsyncStorage with an explicit warning.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { StateStorage } from 'zustand/middleware';

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or serialisation failure — non-fatal.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // no-op
    }
  },
};

const secureAvailable = Platform.OS !== 'web';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      if (!secureAvailable) return AsyncStorage.getItem(key);
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (!secureAvailable) {
        await AsyncStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // no-op
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (!secureAvailable) {
        await AsyncStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // no-op
    }
  },
};

/** Adapter that lets Zustand's `persist` middleware write to AsyncStorage. */
export const zustandStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // no-op
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // no-op
    }
  },
};
