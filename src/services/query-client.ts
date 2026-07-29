/**
 * React Query client.
 *
 * Tuned for mobile: retry once (a phone on a flaky connection should fail fast
 * and show the error state rather than spin), and do not refetch on window
 * focus — that is a web concept that costs battery here.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 800,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
