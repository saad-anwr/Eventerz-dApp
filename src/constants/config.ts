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
  /*
   * The production domain, and it has to be: this is the origin in every link
   * the app shares. It was a `*.vercel.app` preview URL, so sharing an event or
   * a ticket sent people to a deploy preview rather than to the site - a link
   * that works today and is not guaranteed to exist tomorrow.
   *
   * Must match `siteConfig.url` in the website's `lib/site.ts`, since both name
   * the same pages. `EXPO_PUBLIC_SITE_URL` overrides it so a preview build can
   * point at a preview deploy; the trailing slash is stripped because every use
   * appends a path.
   */
  url: (
    process.env.EXPO_PUBLIC_SITE_URL ?? 'https://www.eventerz.xyz'
  ).replace(/\/$/, ''),
  creator: 'Eventerz Labs',
  links: {
    twitter: 'https://twitter.com/eventerz_web',
    github: 'https://github.com/saad-anwr/Eventerz',
    discord: 'https://discord.gg/_saadanwar',
    support: 'mailto:support@eventerz.xyz',
  },
} as const;

/**
 * Solana / backend integration seams. Bodies live in `services/` - these are
 * only the values those services read.
 */
export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

const CLUSTERS: readonly SolanaCluster[] = ['mainnet-beta', 'devnet', 'testnet'];

/**
 * Validate the cluster instead of casting it.
 *
 * `as SolanaCluster` told the compiler the string was a cluster; it did not
 * make it one. The value is typed by a human into a `.env`, so the realistic
 * mistakes are `mainnet` (the cluster is `mainnet-beta`), a capitalised
 * variant, and a stray space.
 *
 * An unvalidated value propagates further here than it looks. Nine call sites
 * read this, and one of them is the `cluster` recorded on a payment row - so a
 * typo would be **written into receipts** and their explorer links would point
 * at a cluster that does not exist, permanently and after the money moved.
 * `rpcEndpoint()` would meanwhile build `https://api.mainnet.solana.com`, which
 * resolves to nothing, so every balance read and transfer fails.
 *
 * Falling back to mainnet is the safer wrong answer: it is where a production
 * build was trying to go.
 */
function resolveCluster(): SolanaCluster {
  const raw = process.env.EXPO_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  if (!raw) return 'mainnet-beta';
  if ((CLUSTERS as readonly string[]).includes(raw)) return raw as SolanaCluster;
  // Common enough to be worth accepting: someone who wrote it meant mainnet-beta.
  if (raw === 'mainnet') return 'mainnet-beta';

  if (__DEV__) {
    console.warn(
      `[solana] EXPO_PUBLIC_SOLANA_NETWORK="${process.env.EXPO_PUBLIC_SOLANA_NETWORK}" ` +
        `is not a Solana cluster. Falling back to mainnet-beta. ` +
        `Valid values: ${CLUSTERS.join(', ')}.`,
    );
  }
  return 'mainnet-beta';
}

export const integrationsConfig = {
  solanaNetwork: resolveCluster(),
  heliusRpcUrl: process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? '',
  programId: process.env.EXPO_PUBLIC_EVENTERZ_PROGRAM_ID ?? '',
  merkleTree: process.env.EXPO_PUBLIC_MERKLE_TREE_ADDRESS ?? '',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
} as const;

/**
 * Feature flags. Everything ships behind a flag so real Solana wiring can be
 * switched on per-environment without touching screen code.
 *
 * `useMockWallet` is the important one: while true, `WalletService` resolves to
 * the in-memory adapter. Flip it (or set `EXPO_PUBLIC_USE_MOCK_WALLET=false`)
 * once Mobile Wallet Adapter is installed in a dev build.
 */
export const featureFlags = {
  // Default to the real wallet. Opt *in* to the demo adapter with
  // EXPO_PUBLIC_USE_MOCK_WALLET=true - production should never need it.
  useMockWallet: process.env.EXPO_PUBLIC_USE_MOCK_WALLET === 'true',
  // Default to the real backend. Seed data is opt-in for local development.
  useMockData: process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true',
  enableAnalytics: process.env.EXPO_PUBLIC_ENABLE_ANALYTICS === 'true',
  enablePushNotifications:
    process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true',
  enableBiometricLogin: process.env.EXPO_PUBLIC_ENABLE_BIOMETRICS === 'true',
} as const;

/** Simulated latency for mock repositories, so loading states are real. */
export const MOCK_LATENCY_MS = 420;

/** Deep-link scheme, kept in sync with `app.json` -> `expo.scheme`. */
export const APP_SCHEME = 'eventerz';
