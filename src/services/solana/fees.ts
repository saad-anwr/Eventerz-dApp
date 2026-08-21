/**
 * Platform fees.
 *
 * RSVPing costs $1, in SOL, paid from the connected wallet straight to the
 * Eventerz treasury. It is not refundable.
 *
 * # Creating an event is free
 *
 * It used to cost $5. Charging a host to publish taxes the side of the
 * marketplace that has to move first: no host means no event, no event means
 * nobody to charge $1 to attend. A $5 gate in front of an empty calendar is the
 * expensive kind of revenue.
 *
 * `createEvent` is **removed from `FEE_USD` entirely** rather than set to `0`.
 * A zero amount still walks the whole charge path - quote a price, open the
 * wallet, sign a transfer of nothing - and every one of those steps can still
 * fail and block a publish. Deleting the key makes the type checker find every
 * caller instead, which is how the create flow lost its payment step rather
 * than kept a dormant one.
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
 * the fee on it would make the feature unreachable.
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
  rsvp: 1,
} as const;

export type FeeKind = keyof typeof FEE_USD;

export const FEE_LABEL: Record<FeeKind, string> = {
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
 * Paused for the dApp Store submission: RSVP is free, nothing is charged.
 *
 * The fee itself works and is not being hidden - $1 in SOL to
 * `TREASURY_ADDRESS`, disclosed by `FeeDisclosure` before anyone is asked to
 * sign. It is off because of who reviews the app next.
 *
 * RSVP is the core flow. With the fee live, exercising it costs a reviewer $1
 * of their own mainnet SOL, non-refundably, and a reviewer whose wallet is
 * empty cannot complete it at all - they get an insufficient-funds error on the
 * one screen the review exists to judge. Three submissions have already been
 * rejected, one of them for the reviewer being unable to complete a flow, so
 * putting a paywall in front of the fourth is a risk with no upside: the
 * disclosure work that satisfies the fee policy is already done and stays in
 * the build, exercised by every devnet path.
 *
 * **Turn this back on in a new build, never over the air.** This is a JS
 * constant, so an `expo-updates` OTA would flip a reviewed free app into a
 * charging one without review - which is the kind of thing stores de-list for.
 * A store-visible change in what users are charged belongs in a submission.
 *
 * What has *not* changed is the property that made pausing the safe default:
 * **every fee is non-refundable and irreversible.** There is no chargeback, no
 * support tool to undo one, and no way to reach a user who was charged for an
 * RSVP that then failed to land. That is why the caller pays first and only
 * proceeds on a confirmed transfer, and why `quoteFee` refuses rather than
 * guesses when the SOL price cannot be established.
 */
export const FEES_PAUSED = true;

/**
 * Wallet-to-wallet transfers in DMs - still off.
 *
 * These were once folded in with platform fees under a single switch, which was
 * wrong: they are a different kind of money. A platform fee is Eventerz
 * charging for a service it renders. A DM transfer is two users paying each
 * other, with Eventerz as neither party and no way to intervene if one of them
 * is being defrauded.
 *
 * So the two switch independently. Turning fees on says nothing about whether
 * strangers should be able to send each other SOL inside a chat, and this
 * stayed off when fees were turned on because only the fees were asked for.
 *
 * Gated on the cluster rather than switched off outright: devnet SOL is play
 * money, so a devnet build keeps the feature exercisable while a mainnet build
 * cannot move a lamport.
 */
export const TRANSFERS_PAUSED = true;

/**
 * Devnet and testnet SOL is free, so charging there is meaningless.
 *
 * Callers treat `false` as "this action is free": RSVP goes straight through,
 * so pausing here removes the charge without leaving a half-paid path anywhere.
 */
export const feesEnabled = (): boolean =>
  !FEES_PAUSED && integrationsConfig.solanaNetwork === 'mainnet-beta';

/** @see TRANSFERS_PAUSED */
export const transfersEnabled = (): boolean =>
  !TRANSFERS_PAUSED || integrationsConfig.solanaNetwork !== 'mainnet-beta';
