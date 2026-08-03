#!/usr/bin/env node
/**
 * Mainnet readiness check.
 *
 *   npm run check:mainnet
 *
 * # Why this exists
 *
 * "Ready for mainnet" is not one switch. It is a cluster setting, a dedicated
 * RPC, a deployed program whose id the app agrees with, and a treasury that can
 * actually receive money - and every one of them fails differently and quietly:
 *
 *   * wrong cluster        -> transactions succeed against play money
 *   * public RPC           -> works until it is busy, then hangs at "confirming"
 *   * no program id        -> events and RSVPs never reach the chain at all
 *   * placeholder id       -> points at an address this project does not own
 *   * program not deployed -> every on-chain call fails with the same opaque error
 *
 * None of those raise anything at build time. This asks the cluster directly,
 * so the answer is what is true right now rather than what the config claims.
 *
 * Exits non-zero when something would break on mainnet, so it can gate a
 * release. A warning is a thing worth knowing that will still work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The address `anchor init` writes. Real on mainnet, owned by someone else. */
const ANCHOR_PLACEHOLDER = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const results = [];
const record = (name, status, detail = '') => {
  results.push({ name, status, detail });
  const tag =
    status === 'PASS' ? c.green('PASS') : status === 'FAIL' ? c.red('FAIL') : c.yellow('WARN');
  console.log(`  ${tag}  ${name}${detail ? c.dim(` - ${detail}`) : ''}`);
};

/* ------------------------------------------------------------------- env -- */

/**
 * Read `.env` directly rather than trusting `process.env`.
 *
 * This is the file a local `gradlew assembleRelease` bundles, so it is the one
 * that decides how a locally built APK behaves. EAS builds read `eas.json`
 * instead, which is checked separately below - the two drifting apart is a real
 * failure mode and the whole reason both are inspected.
 */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  /*
   * Split on `\r?\n`, not `\n`.
   *
   * This file has CRLF endings on Windows, and in a JavaScript regex `\r` is a
   * line terminator - so `.` will not match it and `(.*)$` never reaches the
   * end of the string. The pattern below silently matched nothing, and this
   * script confidently reported a correctly configured RPC as missing. A
   * preflight that cries wolf is worse than no preflight.
   */
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = readEnvFile(join(root, '.env'));

let easEnv = {};
let easUsesManagedEnv = false;
try {
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
  easEnv = eas?.build?.base?.env ?? {};
  /*
   * A profile naming an `environment` pulls its values from EAS-managed
   * variables rather than from this file. That is the better place for them -
   * the Helius URL carries a billable key, and eas.json is committed - so it is
   * checked as a configuration *style*, not as a missing value. This script
   * cannot read those variables (they live in Expo's dashboard), so it says so
   * instead of guessing.
   */
  easUsesManagedEnv = ['preview', 'production', 'play'].some(
    (p) => typeof eas?.build?.[p]?.environment === 'string',
  );
} catch {
  // Reported below as its own check.
}

console.log(c.bold('\nEventerz - mainnet readiness\n'));
console.log(c.bold('Configuration'));

const cluster = env.EXPO_PUBLIC_SOLANA_NETWORK || '(unset, defaults to mainnet-beta)';
record(
  'Cluster is mainnet-beta',
  /^mainnet(-beta)?$/i.test(env.EXPO_PUBLIC_SOLANA_NETWORK ?? 'mainnet-beta') ? 'PASS' : 'FAIL',
  cluster,
);

const rpc = env.EXPO_PUBLIC_HELIUS_RPC_URL ?? '';
record(
  'Dedicated RPC configured',
  /^https?:\/\//i.test(rpc) ? 'PASS' : 'FAIL',
  rpc ? rpc.replace(/api-key=[^&]+/, 'api-key=***') : 'blank - the public endpoint is rate-limited and will stall under load',
);

/*
 * The two sources of truth must agree. A blank here and a value there means the
 * same commit produces two builds that behave differently, which is a miserable
 * thing to chase from a bug report.
 */
const easRpc = easEnv.EXPO_PUBLIC_HELIUS_RPC_URL ?? '';
if (easUsesManagedEnv) {
  record(
    'EAS builds get their values from somewhere',
    'PASS',
    'eas.json profiles name an EAS environment - verify with `eas env:list`',
  );
} else if (rpc && easRpc && rpc === easRpc) {
  record('.env and eas.json agree on the RPC', 'PASS', 'identical');
} else {
  record(
    '.env and eas.json agree on the RPC',
    'FAIL',
    'a local build and an EAS build would use different endpoints',
  );
}

/*
 * The Google consent screen shows the root domain of the OAuth callback, and
 * the callback lives on whatever host `EXPO_PUBLIC_SUPABASE_URL` points at. On
 * the default host that reads "Sign in to <project-ref>.supabase.co", which
 * tells the user nothing about Eventerz and is exactly the shape a phishing
 * page would have. Fixed by a Supabase custom domain, not by any code here.
 */
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const onDefaultAuthHost = /\.supabase\.co\/?$/i.test(supabaseUrl.trim());
record(
  'Auth domain is branded',
  supabaseUrl && !onDefaultAuthHost ? 'PASS' : 'WARN',
  onDefaultAuthHost
    ? 'Google sign-in says "Sign in to <project-ref>.supabase.co" - needs a Supabase custom domain'
    : supabaseUrl || 'no Supabase URL configured',
);

const mockWallet = (env.EXPO_PUBLIC_USE_MOCK_WALLET ?? 'false').toLowerCase() === 'true';
const mockData = (env.EXPO_PUBLIC_USE_MOCK_DATA ?? 'false').toLowerCase() === 'true';
record(
  'Mock adapters are off',
  !mockWallet && !mockData ? 'PASS' : 'FAIL',
  mockWallet || mockData
    ? `mock wallet=${mockWallet}, mock data=${mockData} - nothing would reach the chain`
    : 'real wallet, real backend',
);

/* ---------------------------------------------------------- on-chain plan -- */

/*
 * The custom Anchor program was retired in favour of Metaplex Bubblegum.
 *
 * Nothing about that is a downgrade: Bubblegum is already deployed on mainnet,
 * so there is no program to build, no 2-4 SOL of program rent, and - the part
 * that actually mattered - no upgrade authority that could rewrite what
 * `claim_seat` does to a paid event. A tree account costs about 0.31 SOL once.
 *
 * So a blank program id is no longer a failure. It is the intended shape, and
 * this section checks the thing that replaced it.
 */

console.log(`\n${c.bold('On-chain assets (Metaplex cNFT)')}`);

const programId = env.EXPO_PUBLIC_EVENTERZ_PROGRAM_ID ?? '';
const merkleTree = env.EXPO_PUBLIC_MERKLE_TREE_ADDRESS ?? '';

if (programId && programId !== ANCHOR_PLACEHOLDER) {
  record(
    'Custom program is not in use',
    'WARN',
    `EXPO_PUBLIC_EVENTERZ_PROGRAM_ID is set to ${programId} - that path was retired; clients will attempt on-chain writes against it`,
  );
} else {
  record('Custom program is not in use', 'PASS', 'Bubblegum instead of a bespoke program');
}

if (!merkleTree) {
  record(
    'Merkle tree provisioned',
    'WARN',
    'blank - tickets and badges stay Postgres records; run scripts/create-tree.mjs to enable minting',
  );
} else {
  record('Merkle tree provisioned', 'PASS', merkleTree);
}

/* ------------------------------------------------------------------ chain -- */

console.log(`\n${c.bold('On-chain')}`);

const endpoint = /^https?:\/\//i.test(rpc) ? rpc : 'https://api.mainnet-beta.solana.com';

async function rpcCall(method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'preflight', method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} returned ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? 'RPC error');
  return body.result;
}

try {
  const version = await rpcCall('getVersion', []);
  record('RPC reachable', 'PASS', `solana-core ${version['solana-core'] ?? '?'}`);

  /*
   * Confirm the endpoint really is mainnet. A Helius URL for the wrong cluster
   * looks identical in config and is indistinguishable until money moves.
   */
  const genesis = await rpcCall('getGenesisHash', []);
  const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  record(
    'Endpoint is really mainnet-beta',
    genesis === MAINNET_GENESIS ? 'PASS' : 'FAIL',
    genesis === MAINNET_GENESIS ? genesis : `genesis ${genesis} is not mainnet`,
  );

  /*
   * A tree address that resolves to nothing, or to an account owned by anything
   * other than SPL account-compression, is worse than a blank one: the config
   * claims minting works and every mint fails. Checking the owner is what
   * separates "a real tree" from "a well-formed pubkey somebody pasted".
   */
  const COMPRESSION_PROGRAM = 'cmtDvXumGCrqC1age74HJDoZ9pyrp2Ep6PPMU2X9jNc';

  if (merkleTree) {
    const info = await rpcCall('getAccountInfo', [merkleTree, { encoding: 'base64' }]);
    const account = info?.value;
    record(
      'Merkle tree exists on this cluster',
      account?.owner === COMPRESSION_PROGRAM ? 'PASS' : 'FAIL',
      account
        ? account.owner === COMPRESSION_PROGRAM
          ? `owned by account-compression`
          : `owned by ${account.owner}, not account-compression - this is not a tree`
        : 'no account at that address on this cluster',
    );
  } else {
    record(
      'Merkle tree exists on this cluster',
      'WARN',
      'nothing to check while EXPO_PUBLIC_MERKLE_TREE_ADDRESS is blank',
    );
  }

  // The treasury only has to be able to receive. A brand-new address holding
  // nothing is valid - it just must be a real, well-formed pubkey.
  const treasury = 'HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781Pw5oJ';
  const bal = await rpcCall('getBalance', [treasury]);
  record(
    'Fee treasury is a valid address',
    typeof bal?.value === 'number' ? 'PASS' : 'FAIL',
    `${treasury} - ${((bal?.value ?? 0) / 1e9).toFixed(4)} SOL`,
  );
} catch (error) {
  record('RPC reachable', 'FAIL', error instanceof Error ? error.message : String(error));
}

/* ---------------------------------------------------------------- summary -- */

const failed = results.filter((r) => r.status === 'FAIL');
const warned = results.filter((r) => r.status === 'WARN');
const passed = results.filter((r) => r.status === 'PASS');

console.log(
  `\n${c.bold('Summary')}  ${c.green(`${passed.length} passed`)}  ` +
    `${failed.length ? c.red(`${failed.length} failed`) : c.dim('0 failed')}  ` +
    `${warned.length ? c.yellow(`${warned.length} warnings`) : c.dim('0 warnings')}\n`,
);

if (failed.length) {
  console.log(c.red('Not ready for mainnet:'));
  for (const f of failed) console.log(`  ${c.red('x')} ${f.name}${f.detail ? c.dim(` - ${f.detail}`) : ''}`);
  console.log('');
  process.exit(1);
}
console.log(c.green('Ready for mainnet.\n'));
