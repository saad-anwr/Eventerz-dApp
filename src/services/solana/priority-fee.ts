/**
 * Compute budget and priority fees.
 *
 * # Why a transaction needs this on mainnet
 *
 * On devnet a transaction with no compute-unit price lands every time, because
 * nothing is competing for block space. Mainnet-beta is not that. Leaders order
 * transactions by fee per compute unit, and one that offers nothing sits at the
 * bottom of the queue - during any period of congestion it is simply never
 * included, and roughly 60-90 seconds later its blockhash expires and it dies.
 *
 * From the user's side that is the worst possible failure: the wallet said
 * "sent", the app said "confirming", and then nothing happened. They do not
 * know whether their money moved. This is exactly the failure mode that makes
 * an app feel broken on mainnet while working perfectly in testing.
 *
 * So every transaction this app sends carries two ComputeBudget instructions.
 *
 * # Why both, and not just the price
 *
 * `setComputeUnitPrice` is what buys priority. `setComputeUnitLimit` is what
 * makes it affordable: the priority fee charged is `limit x price`, and the
 * default limit is 200,000 CU per instruction. A plain transfer uses about 150.
 * Paying a priority rate on 200,000 units to move 300 of them is a factor of
 * several hundred in wasted fee, so requesting a realistic limit is not an
 * optimisation - it is the difference between a fee of a few thousand lamports
 * and one of a few million.
 *
 * # Why the price is measured rather than fixed
 *
 * A constant is wrong in both directions: too low and it stops landing the
 * moment the network gets busy, too high and every user overpays permanently.
 * `getRecentPrioritizationFees` reports what recent blocks actually charged for
 * the accounts this transaction touches, which is the only number that tracks
 * congestion as it happens.
 */

import { ComputeBudgetProgram, type PublicKey, type TransactionInstruction } from '@solana/web3.js';

import { rpcCall } from './rpc';

/**
 * Compute-unit ceilings per kind of transaction.
 *
 * Measured against what these instructions actually do, with roughly 2x of
 * headroom. Under-requesting is fatal - the transaction aborts once it exceeds
 * the limit - so the margin is deliberately generous, while still being a small
 * fraction of the 200,000 default the runtime would otherwise assume.
 */
export const COMPUTE_UNITS = {
  /** SystemProgram.transfer: ~150 CU, plus the two budget instructions. */
  transfer: 2_000,
  /** Initialises a PDA and writes it. */
  createEvent: 40_000,
  /** Initialises a seat PDA and may transfer the ticket price to the host. */
  claimSeat: 50_000,
  /** Mutates one or two existing accounts, closes none. */
  simple: 30_000,
} as const;

export type ComputeKind = keyof typeof COMPUTE_UNITS;

/**
 * Bounds on the price, in micro-lamports per compute unit.
 *
 * The floor exists because a reported zero is common and useless: it means
 * recent blocks were not full, which says nothing about the block this
 * transaction is aiming at. A small non-zero bid costs almost nothing and
 * removes the "landed instantly all week, then never landed on launch day"
 * class of failure.
 *
 * The ceiling exists because this is money. A fee spike - an NFT mint, a
 * liquidation cascade - can push the observed rate orders of magnitude up for a
 * few minutes, and silently charging a user that because they happened to press
 * a button at the wrong moment is not acceptable. At the ceiling, an event
 * creation pays 40,000 x 1,000,000 micro-lamports = 0.04 SOL of priority fee,
 * which is already high; anything beyond it should fail and be retried rather
 * than be paid.
 */
const MIN_MICRO_LAMPORTS = 1_000;
const MAX_MICRO_LAMPORTS = 1_000_000;

/** Cached briefly - a create flow can build two transactions back to back. */
let cached: { price: number; at: number } | null = null;
const CACHE_MS = 10_000;

interface PrioritizationFee {
  slot: number;
  prioritizationFee: number;
}

/**
 * What recent blocks charged, for the accounts this transaction writes to.
 *
 * Scoped to the writable accounts on purpose: prioritization is per-account
 * contention, so the network-wide figure over-prices a transaction touching
 * quiet accounts and under-prices one touching a hot program.
 *
 * The 75th percentile rather than the median. The median is the price at which
 * half of recent transactions did *not* get in, and "probably lands" is not the
 * target when the alternative is a user staring at a spinner.
 */
async function measurePrice(writableAccounts: string[]): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;

  try {
    const fees = await rpcCall<PrioritizationFee[]>(
      'getRecentPrioritizationFees',
      // Capped at 128 accounts by the RPC; these calls touch a handful.
      [writableAccounts.slice(0, 128)],
    );

    const observed = (fees ?? [])
      .map((f) => f.prioritizationFee)
      .filter((f) => Number.isFinite(f) && f > 0)
      .sort((a, b) => a - b);

    if (observed.length === 0) {
      cached = { price: MIN_MICRO_LAMPORTS, at: Date.now() };
      return MIN_MICRO_LAMPORTS;
    }

    const p75 = observed[Math.floor(observed.length * 0.75)] ?? observed[observed.length - 1];
    const price = Math.min(
      MAX_MICRO_LAMPORTS,
      Math.max(MIN_MICRO_LAMPORTS, Math.ceil(p75)),
    );

    cached = { price, at: Date.now() };
    return price;
  } catch {
    /*
     * A failed measurement must not stop the transaction. The floor is a
     * reasonable bid and the alternative - refusing to send because we could
     * not price the bid - would turn a slow RPC into a broken app.
     */
    return MIN_MICRO_LAMPORTS;
  }
}

/**
 * The two instructions to prepend to every transaction.
 *
 * Order does not matter to the runtime, but limit-then-price reads the way the
 * fee is calculated.
 */
export async function computeBudgetInstructions(
  kind: ComputeKind,
  writableAccounts: (PublicKey | string)[],
): Promise<TransactionInstruction[]> {
  const units = COMPUTE_UNITS[kind];
  const price = await measurePrice(writableAccounts.map(String));

  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
  ];
}

/** The priority fee a given kind will cost at `price`, in lamports. */
export function priorityFeeLamports(kind: ComputeKind, microLamports: number): number {
  return Math.ceil((COMPUTE_UNITS[kind] * microLamports) / 1_000_000);
}
