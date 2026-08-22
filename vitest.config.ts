import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest for the pure logic in `src/utils/`.
 *
 * Scoped deliberately narrowly. React Native components cannot be rendered here
 * without a native runtime, and testing them under a DOM shim tests the shim.
 * What *is* worth testing is the code that can be silently wrong: lamport
 * arithmetic, the RSVP state machine, and the map URL builders.
 *
 * The most valuable thing in here is the parity check. `src/utils/rsvp.ts`,
 * `src/utils/amount.ts` and `src/utils/maps.ts` are hand-maintained 1:1 ports of
 * the website's `lib/events.ts`, `lib/solana/amount.ts` and `lib/maps.ts`. Two
 * copies of a state machine drift, and the failure is invisible: a guest sees
 * "Requested" on the website and "Pending" in the app and has to work out
 * whether those are the same thing. So both suites assert the same wording and
 * the same numbers, and a change to one that is not mirrored fails the other.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
