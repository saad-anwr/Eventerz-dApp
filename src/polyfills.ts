/**
 * Runtime polyfills.
 *
 * Imported first in the root layout - before anything that touches Solana or
 * Supabase - because these must be installed before those modules initialise.
 *
 * Hermes is missing three things the Solana stack assumes exist:
 *
 *  - `crypto.getRandomValues`, used for keypair and nonce generation. Without
 *    it `@solana/web3.js` throws on import in some paths.
 *  - `Buffer`, used pervasively by web3.js and the MWA protocol for byte
 *    handling.
 *  - A complete `URL` / `URLSearchParams`, which supabase-js uses to build
 *    request URLs.
 */

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Buffer as NodeBuffer } from 'buffer';

// `globalThis` rather than `global`: it is the standard name, exists in Hermes,
// and does not depend on @types/node being present.
const globals = globalThis as typeof globalThis & {
  Buffer?: typeof NodeBuffer;
};

if (typeof globals.Buffer === 'undefined') {
  globals.Buffer = NodeBuffer;
}

export {};
