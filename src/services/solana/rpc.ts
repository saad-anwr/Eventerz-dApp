/**
 * One place that knows which RPC this build talks to, and how to call it.
 *
 * # Why this module exists
 *
 * Endpoint resolution had been copied into three files - the wallet adapter,
 * the holdings lookup, and (nearly) the fee quote. Copies of a rule do not stay
 * equal: each had its own idea of what to do when `EXPO_PUBLIC_HELIUS_RPC_URL`
 * was blank, and only one of them warned about it. On mainnet that difference
 * is not cosmetic - the public endpoint is rate-limited, so the file that fell
 * back silently was the file whose feature quietly stopped working under load.
 *
 * # Why the fallback warns instead of failing
 *
 * A missing RPC is a deployment mistake, not a user mistake, and refusing to
 * start would punish the wrong person. The public endpoint does work; it is
 * simply not something to run a product on. So it degrades, loudly, once.
 */

import { integrationsConfig } from '@/constants/config';

/** Warned once per launch. This is read on nearly every screen. */
let warnedAboutPublicRpc = false;

export function rpcEndpoint(): string {
  const custom = integrationsConfig.heliusRpcUrl.trim();
  if (custom && /^https?:\/\//i.test(custom)) return custom;

  const cluster = integrationsConfig.solanaNetwork;

  if (cluster === 'mainnet-beta' && !warnedAboutPublicRpc) {
    warnedAboutPublicRpc = true;
    console.warn(
      '[solana] Using the public mainnet RPC. It is rate-limited and not ' +
        'suitable for production traffic - set EXPO_PUBLIC_HELIUS_RPC_URL.',
    );
  }

  return cluster === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : `https://api.${cluster}.solana.com`;
}

/** True when the configured endpoint is Helius, which serves the DAS methods. */
export const isHeliusRpc = (): boolean =>
  /helius/i.test(integrationsConfig.heliusRpcUrl);

/**
 * A single JSON-RPC call.
 *
 * Errors are thrown rather than returned as null: a caller that wants to treat
 * a failure as "no data" can `.catch()` and say so at the call site, which is
 * where the decision belongs. Swallowing it here would make an outage look
 * identical to an empty wallet.
 */
export async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(rpcEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'eventerz', method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed (${response.status})`);
  }

  const body = (await response.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

/** What we were able to establish about a submitted transaction. */
export type SettlementOutcome =
  /** On-chain and successful. */
  | { status: 'confirmed' }
  /** On-chain and it failed. No funds moved beyond the network fee. */
  | { status: 'failed'; error: string }
  /** Still not visible within the window. Undecided, *not* failed. */
  | { status: 'unknown' };

interface SignatureStatus {
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
  err: unknown | null;
}

/**
 * Wait for a signature to settle.
 *
 * # Why three outcomes and not two
 *
 * The tempting shape is a boolean, and it is wrong. "Not confirmed yet" and
 * "confirmed as failed" lead to opposite actions when real money is involved:
 *
 *  - **failed** is safe to retry. The transfer did not execute, so the user was
 *    charged nothing beyond a few thousand lamports of network fee. Telling
 *    them to try again is correct.
 *  - **unknown** must never be reported as a failure. The transaction may well
 *    land a second later, and inviting a retry there is inviting a *second*
 *    non-refundable charge for the same thing. A caller should proceed and let
 *    the user keep what they paid for.
 *
 * Collapsing the two loses exactly the distinction that decides whether someone
 * gets charged twice, which is why the timeout resolves rather than throws.
 */
export async function awaitSettlement(
  signature: string,
  { timeoutMs = 25_000, pollMs = 1_500 } = {},
): Promise<SettlementOutcome> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await rpcCall<{ value: (SignatureStatus | null)[] }>(
        'getSignatureStatuses',
        [[signature], { searchTransactionHistory: true }],
      );
      const status = res.value?.[0];

      if (status) {
        if (status.err) {
          return { status: 'failed', error: describeTxError(status.err) };
        }
        // `processed` is one confirmation and can still be rolled back, so it
        // is not enough to hand someone a paid-for thing on.
        if (
          status.confirmationStatus === 'confirmed' ||
          status.confirmationStatus === 'finalized'
        ) {
          return { status: 'confirmed' };
        }
      }
    } catch {
      // A flaky RPC is not evidence about the transaction. Keep polling.
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return { status: 'unknown' };
}

/** Turn a raw `err` object into something worth showing a person. */
function describeTxError(err: unknown): string {
  const raw = typeof err === 'string' ? err : JSON.stringify(err);

  // By far the most common real cause, and the only one the user can fix.
  if (/InsufficientFundsForRent|insufficient lamports|InsufficientFunds/i.test(raw)) {
    return 'Your wallet does not have enough SOL to cover this and the network fee.';
  }
  return 'The network rejected the transaction.';
}
