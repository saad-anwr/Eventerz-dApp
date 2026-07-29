/**
 * App-wide configuration.
 *
 * Mirrors the web app's `lib/site.ts` plus the environment seams from
 * `lib/integrations.ts`. Every value is readable at runtime from
 * `process.env.EXPO_PUBLIC_*` (see `.env.example`); the fallbacks keep the app
 * fully functional with no `.env` file present.
 */

export const siteConfig = {
  name: 'Eventerz',
  shortName: 'Eventerz',
  tagline: 'Everything is On-chain. Why not your events?',
  description:
    'Eventerz is wallet-native event infrastructure on Solana. Discover events, RSVP on-chain, receive NFT tickets and Proof-of-Attendance, build portable reputation and join token-gated communities.',
  url: 'https://eventerz-three.vercel.app',
  creator: 'Eventerz Labs',
  links: {
    twitter: 'https://twitter.com/eventerz_web',
    github: 'https://github.com/saad-anwr/Eventerz',
    discord: 'https://discord.gg/_saadanwar',
    support: 'mailto:support@eventerz.xyz',
  },
} as const;

/**
 * Solana / backend integration seams. Bodies live in `services/` — these are
 * only the values those services read.
 */
export const integrationsConfig = {
  solanaNetwork:
    (process.env.EXPO_PUBLIC_SOLANA_NETWORK as SolanaCluster | undefined) ??
    'devnet',
  heliusRpcUrl: process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? '',
  programId: process.env.EXPO_PUBLIC_EVENTERZ_PROGRAM_ID ?? '',
  merkleTree: process.env.EXPO_PUBLIC_MERKLE_TREE_ADDRESS ?? '',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
} as const;

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

/**
 * Feature flags. Everything ships behind a flag so real Solana wiring can be
 * switched on per-environment without touching screen code.
 *
 * `useMockWallet` is the important one: while true, `WalletService` resolves to
 * the in-memory adapter. Flip it (or set `EXPO_PUBLIC_USE_MOCK_WALLET=false`)
 * once Mobile Wallet Adapter is installed in a dev build.
 */
export const featureFlags = {
  useMockWallet: process.env.EXPO_PUBLIC_USE_MOCK_WALLET !== 'false',
  useMockData: process.env.EXPO_PUBLIC_USE_MOCK_DATA !== 'false',
  enableAnalytics: process.env.EXPO_PUBLIC_ENABLE_ANALYTICS === 'true',
  enablePushNotifications:
    process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true',
  enableBiometricLogin: process.env.EXPO_PUBLIC_ENABLE_BIOMETRICS === 'true',
} as const;

/** Simulated latency for mock repositories, so loading states are real. */
export const MOCK_LATENCY_MS = 420;

/** Deep-link scheme, kept in sync with `app.json` → `expo.scheme`. */
export const APP_SCHEME = 'eventerz';
