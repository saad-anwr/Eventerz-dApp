/** Small async helpers shared by the mock repositories. */

import { MOCK_LATENCY_MS } from '@/constants';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulate network latency with a little jitter so skeleton states look
 * organic rather than metronomic. Replaced by real I/O when a backend lands.
 */
export function mockDelay(base = MOCK_LATENCY_MS): Promise<void> {
  const jitter = Math.random() * base * 0.4;
  return sleep(base + jitter);
}
