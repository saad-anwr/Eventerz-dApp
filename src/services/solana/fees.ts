/**
 * Platform fees.
 *
 * Creating an event costs $5, RSVPing costs $1, both in SOL, both paid from the
 * connected wallet straight to the Eventerz treasury. Neither is refundable.
 *
 * # Why the price is fetched and never guessed
 *
 * The fee is denominated in dollars and settled in SOL, so it needs a rate. A
 * hard-coded or stale rate does not fail safely - it silently overcharges or
 * undercharges every user, and SOL has moved 30% in a week often enough that
 * "close enough" is not a defensible position when the money is real and the
 * charge is non-refundable.
 *
 * So a failed price lookup is a hard error. Refusing to take a payment is the
 * only honest outcome when the amount cannot be established.
 *
 * # Why this is a plain transfer
 *
 * A System Program transfer needs no deployed program, which is the same reason
 * in-chat payments work today. The Anchor program is not deployed, and gating
 * event creation on it would make the feature unreachable.
 */

import { integrationsConfig } from '@/constants/config';

/**
 * Eventerz treasury.
 *
 * Fees are non-refundable and irreversible once approved, so this address is a
 * constant in the bundle rather than anything a screen can pass in - a
 * recipient that could be supplied by a caller is a recipient that could be
 * swapped.
 */
export const TREASURY_ADDRESS = 'HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781Pw5oJ';

export const FEE_USD = {
  createEvent: 5,
  rsvp: 1,
} as const;

export type FeeKind = keyof typeof FEE_USD;

export const FEE_LABEL: Record<FeeKind, string> = {
  createEvent: 'Event creation fee',
  rsvp: 'RSVP fee',
};

const LAMPORTS_PER_SOL = 1_000_000_000;

/** Cached briefly: a create flow reads the price two or three times. */
let cached: { usdPerSol: number; at: number } | null = null;
const CACHE_MS = 60_000;

/**
 * SOL price in USD.
 *
 * Two independent sources, tried in order. Not redundancy for its own sake: a
 * single source that is down means no one can create an event, and a single
 * source that is *wrong* means everyone is charged the wrong amount.
 */
async function fetchUsdPerSol(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.usdPerSol;

  const sources: (() => Promise<number>)[] = [
    async () => {
      const r = await fetch(
        'https://api.coinbase.com/v2/prices/SOL-USD/spot',
        { headers: { Accept: 'application/json' } },
      );
      const j = (await r.json()) as { data?: { amount?: string } };
      return Number(j.data?.amount);
    },
    async () => {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { headers: { Accept: 'application/json' } },
      );
      const j = (await r.json()) as { solana?: { usd?: number } };
      return Number(j.solana?.usd);
    },
  ];

  for (const source of sources) {
    try {
      const price = await source();
      // A price of 0, NaN or something absurd is worse than no price: it would
      // produce a fee of zero or of someone's whole balance.
      if (Number.isFinite(price) && price > 1 && price < 100_000) {
        cached = { usdPerSol: price, at: Date.now() };
        return price;
      }
    } catch {
      // Try the next source.
    }
  }

  throw new Error(
    'Could not check the SOL price, so the fee cannot be calculated. Try again in a moment.',
  );
}

/**
 * The SOL price, or null when it could not be established.
 *
 * The non-throwing twin of `fetchUsdPerSol`, for callers that are *displaying*
 * a value rather than charging one. The distinction matters: a missing price
 * must stop a payment, but it must not stop a balance from rendering.
 */
export async function usdPerSolOrNull(): Promise<number | null> {
  try {
    return await fetchUsdPerSol();
  } catch {
    return null;
  }
}

export interface FeeQuote {
  kind: FeeKind;
  usd: number;
  usdPerSol: number;
  lamports: bigint;
  /** Display value. Never use this for the transfer amount. */
  sol: number;
}

/**
 * What this fee costs right now.
 *
 * Rounded UP to the lamport. Rounding down would undercharge by a lamport and,
 * more importantly, makes the amount depend on floating-point rounding mode -
 * this way the treasury is never short and the result is deterministic.
 */
export async function quoteFee(kind: FeeKind): Promise<FeeQuote> {
  const usdPerSol = await fetchUsdPerSol();
  const usd = FEE_USD[kind];
  const lamports = BigInt(Math.ceil((usd / usdPerSol) * LAMPORTS_PER_SOL));

  return {
    kind,
    usd,
    usdPerSol,
    lamports,
    sol: Number(lamports) / LAMPORTS_PER_SOL,
  };
}

/** `0.0234 SOL` - four decimals, which is the scale these fees live at. */
export function formatFeeSol(lamports: bigint): string {
  return `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}

/**
 * Platform fees are paused.
 *
 * Flip to `false` to start charging again - nothing else needs to change, and
 * the quoting, transfer and receipt code below stays exercised and ready.
 *
 * Paused deliberately rather than deleted: taking $5 to create an event is a
 * hard thing to ask for while the program is undeployed and the Edge Functions
 * are not live, and a fee that fails after the money moves is worse than no fee
 * at all. Every fee is non-refundable and irreversible, so the safe default
 * while the backend is still landing is not to charge.
 */
export const FEES_PAUSED = true;

/**
 * The master switch: no path in the app moves real money while this is true.
 *
 * `FEES_PAUSED` only ever covered *platform* fees - the $5 create and the $1
 * RSVP that settle to the treasury. It never covered peer-to-peer transfers in
 * DMs, which are a different thing entirely: Eventerz is not a party to them,
 * they need no deployed program, and they were live on mainnet with real SOL
 * while every other money path was switched off.
 *
 * v1.0.0 ships as a mainnet app with no real money in it, so both categories
 * are off together and there is one constant to flip rather than two to
 * remember. Nothing below is deleted - the quoting, transfer and receipt code
 * stays exercised and ready for the release that turns this back on.
 */
export const REAL_MONEY_PAUSED = true;

/**
 * Devnet and testnet SOL is free, so charging there is meaningless.
 *
 * Callers treat `false` as "this action is free": the create flow skips the
 * transfer entirely and RSVP goes straight through, so pausing here removes the
 * charge without leaving a half-paid path anywhere.
 */
export const feesEnabled = (): boolean =>
  !REAL_MONEY_PAUSED &&
  !FEES_PAUSED &&
  integrationsConfig.solanaNetwork === 'mainnet-beta';

/**
 * Wallet-to-wallet transfers in DMs.
 *
 * Gated on the cluster rather than switched off outright: the concern is *real*
 * money, and devnet SOL is play money, so a devnet build keeps the feature
 * usable for testing while a mainnet build cannot move a lamport.
 */
export const transfersEnabled = (): boolean =>
  !REAL_MONEY_PAUSED || integrationsConfig.solanaNetwork !== 'mainnet-beta';
