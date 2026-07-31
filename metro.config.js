const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/*
 * Package "exports" resolution stays ON. Do not turn it off.
 *
 * Every bundle prints two warnings, and they are harmless:
 *
 *   Attempted to import the module "rpc-websockets" which is listed in the
 *   "exports" of "rpc-websockets", however no match was resolved for this
 *   request (platform = android). Falling back to file-based resolution.
 *
 *   Attempted to import the module "@noble/hashes/crypto.js" which is not
 *   listed in the "exports" of "@noble/hashes" under the requested subpath
 *   "./crypto.js". Falling back to file-based resolution.
 *
 * Both come from @solana/web3.js v1 - rpc-websockets via jayson, and a deep
 * import of crypto.js - and both resolve through the fallback, so the bundle is
 * correct.
 *
 * The obvious fix is `config.resolver.unstable_enablePackageExports = false`,
 * which is what the Expo docs suggest for packages that are not ready for ES
 * Modules resolution. It was tried here and it breaks the app:
 *
 *   Unable to resolve "@solana-mobile/mobile-wallet-adapter-protocol/encoding"
 *   from "@solana-mobile/mobile-wallet-adapter-protocol-web3js/lib/cjs/index.native.js"
 *
 * That subpath exists *only* in the package's exports map - there is no file at
 * that path to fall back to. Disabling exports therefore takes out Mobile Wallet
 * Adapter, which is how every wallet connection and signature works on Android.
 * Two cosmetic warnings are a much better trade than no wallet.
 *
 * Revisit after the @solana/web3.js v2 migration: v2 is ESM-first and ships
 * correct exports maps, so the warnings should disappear on their own.
 */

module.exports = withNativeWind(config, { input: './src/global.css' });
