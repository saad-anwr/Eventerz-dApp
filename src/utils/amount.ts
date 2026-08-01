/**
 * Converting between what a user types and what a chain moves.
 *
 * Ported 1:1 from the website's `lib/solana/amount.ts`. Every function is
 * string->BigInt or BigInt->string, and none of them go through `Number`. That is
 * not fastidiousness: `0.1 + 0.2 !== 0.3` in binary floating point, and
 * `Number.MAX_SAFE_INTEGER` is about 9.007e15 - so a lamport value above roughly
 * 9 million SOL is already unrepresentable as a JS number. A ledger that cannot
 * add up is not a ledger.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * A decimal string in whole units -> base units.
 *
 * Throws on anything that is not a plain non-negative decimal. Coercing "1,5"
 * or "1 SOL" into something would be worse than refusing: the user would be
 * shown a confirmation for an amount they did not write.
 */
export function toBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error('Enter an amount like 0.25');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(
      `That is more precision than this token has (${decimals} decimals).`,
    );
  }

  // Pad rather than round. Truncating the user's digits changes the amount.
  const padded = fraction.padEnd(decimals, '0');
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

/**
 * Base units -> a decimal string, trailing zeros trimmed.
 *
 * "0.4 SOL", never "0.400000000". Long runs of zeros make two amounts hard to
 * compare at a glance, which is the only thing anyone does with a receipt.
 */
export function fromBaseUnits(amount: bigint | string, decimals: number): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;

  if (fraction === 0n) return `${negative ? '-' : ''}${whole}`;

  const padded = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}.${padded}`;
}

/** "0.4 SOL" - the amount and its ticker, formatted for display. */
export function formatTokenAmount(
  amount: bigint | string,
  decimals: number,
  symbol: string,
): string {
  return `${fromBaseUnits(amount, decimals)} ${symbol}`;
}

export const solToLamports = (sol: string): bigint => toBaseUnits(sol, 9);
export const lamportsToSol = (lamports: bigint | string): string =>
  fromBaseUnits(lamports, 9);

/**
 * An event's display price -> lamports, for the on-chain account.
 *
 * `EventItem.price` is a human string: "Free", "0.5 SOL", sometimes just "0.5".
 * The on-chain `price_lamports` is a u64 that `claim_seat` transfers to the
 * host, so this is the point where a display string becomes money.
 *
 * Unparseable input returns 0 rather than throwing, and that direction is
 * chosen deliberately. Zero means the guest is charged nothing on-chain, which
 * costs the host a ticket price; throwing would abort publishing the event
 * entirely. But the truly bad outcome is neither - it is charging a guest an
 * amount nobody intended - and returning 0 cannot do that. Anything this
 * cannot read is something the host typed freely, and free is the safe reading
 * of "I do not know what this says".
 */
export function priceToLamports(price: string | null | undefined): bigint {
  if (!price) return 0n;

  const trimmed = price.trim();
  if (!trimmed || /^free$/i.test(trimmed)) return 0n;

  // "0.5 SOL", "0.5SOL", "◎0.5" - take the first plain decimal present.
  const match = trimmed.match(/\d+(?:\.\d+)?/);
  if (!match) return 0n;

  try {
    return solToLamports(match[0]);
  } catch {
    return 0n;
  }
}

/**
 * Headroom left unspendable so the transfer's own fee can be paid.
 *
 * A base transaction fee is 5,000 lamports per signature. 10,000 covers that
 * with room for a priority fee, and is small enough (0.00001 SOL) that nobody
 * notices it withheld. A "max" that leaves nothing for the fee produces a
 * transaction that always fails, which reads as the app being broken.
 */
export const FEE_HEADROOM_LAMPORTS = 10_000n;

/** The most of a SOL balance that can actually be sent. */
export function maxSendableLamports(balanceLamports: bigint): bigint {
  const spendable = balanceLamports - FEE_HEADROOM_LAMPORTS;
  return spendable > 0n ? spendable : 0n;
}
