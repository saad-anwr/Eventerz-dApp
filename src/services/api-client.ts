/**
 * Typed HTTP client for the future Eventerz backend.
 *
 * Unused while `featureFlags.useMockData` is true — repositories read from the
 * in-memory database instead. It exists so the transport concerns (base URL,
 * auth header, timeout, error shape) are settled before the first real
 * endpoint lands, and repositories only need their bodies swapped.
 */

import { integrationsConfig } from '@/constants/config';
import { SecureKeys } from '@/constants/storage-keys';
import { secureStorage } from '@/utils';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const base = integrationsConfig.apiBaseUrl;
  if (!base) {
    throw new ApiError('EXPO_PUBLIC_API_BASE_URL is not configured.', 0);
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = await secureStorage.get(SecureKeys.SESSION_TOKEN);
    const response = await fetch(`${base}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });

    const isJson = response.headers
      .get('content-type')
      ?.includes('application/json');
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError(
        `Request failed: ${response.status}`,
        response.status,
        body,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The request timed out.', 408);
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
