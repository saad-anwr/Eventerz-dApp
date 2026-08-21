/**
 * Charge a platform fee, then run the action.
 *
 * The ordering is the whole point and it only works one way round: the fee is
 * confirmed on-chain *before* the event is created or the RSVP is sent. The
 * other order - act first, charge after - produces a free event whenever the
 * payment fails, and there is no way to un-create it.
 *
 * The cost of this ordering is the opposite failure: the fee lands and the
 * action then fails. That is recoverable (the signature is real, support can
 * see it) and it is the better of the two, which is why the error says so
 * explicitly rather than just "something went wrong".
 */

import { useCallback, useEffect, useState } from 'react';

import {
  FEE_LABEL,
  FEE_USD,
  TREASURY_ADDRESS,
  feesEnabled,
  quoteFee,
  type FeeKind,
  type FeeQuote,
} from '@/services/solana/fees';
import { awaitSettlement } from '@/services/solana/rpc';
import { walletService } from '@/services/wallet';
import { describeSigningError, isWalletCancellation } from '@/services/wallet/errors';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { haptics } from '@/utils/haptics';

/**
 * What this fee will cost, for **display** - resolved before anyone is asked to
 * pay it.
 *
 * # Why a display-only twin exists
 *
 * The fee used to be disclosed exactly once, by `payFee` itself, in a toast
 * raised on the same tick that hands control to the wallet. Android then dims
 * the screen and animates the wallet in over the top, so the sentence naming
 * the amount was on screen for a few hundred milliseconds, behind a scrim,
 * while the user was looking at a different app. A dApp Store reviewer reported
 * precisely that: *"fees banner bounces and moves and instantly darkens so user
 * cannot read clearly."*
 *
 * A charge has to be legible **before** the flow that takes it starts, on a
 * surface that stays still and stays put. That is what this feeds.
 *
 * Never throws. A missing price must not stop a review screen from rendering -
 * `payFee` is what refuses when the amount cannot be established, and it quotes
 * again at charge time rather than trusting anything shown here.
 */
export function useFeeQuote(kind: FeeKind) {
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!feesEnabled()) return;

    let cancelled = false;

    /*
     * Both branches set both pieces of state, rather than resetting `failed`
     * synchronously up here first. A synchronous setState in an effect body
     * cascades a second render before the async work has even started, and
     * lint rightly refuses it - the reset belongs where the new answer lands.
     */
    void (async () => {
      try {
        const resolved = await quoteFee(kind);
        if (cancelled) return;
        setQuote(resolved);
        setFailed(false);
      } catch {
        // Shown as "about $5" rather than a precise SOL amount. The dollar
        // figure is fixed and true regardless of whether the rate resolved.
        if (cancelled) return;
        setQuote(null);
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  return {
    /** Null while loading, or when the SOL rate could not be established. */
    quote,
    /** The rate lookup failed. The USD figure below is still exact. */
    failed,
    usd: FEE_USD[kind],
    label: FEE_LABEL[kind],
    treasury: TREASURY_ADDRESS,
    /** False on devnet/testnet, where nothing is charged at all. */
    charged: feesEnabled(),
  };
}

export function useFee(kind: FeeKind) {
  const account = useWalletStore((s) => s.account);
  const refreshBalance = useWalletStore((s) => s.refreshBalance);
  const [paying, setPaying] = useState(false);

  /**
   * Returns the signature when paid, or null when the user declined.
   * Throws when the fee could not be taken - callers must not proceed.
   */
  const payFee = useCallback(async (): Promise<string | null> => {
    // Free on devnet/testnet: the SOL has no value, so a charge there is
    // theatre that only complicates testing.
    if (!feesEnabled()) return null;

    if (!account) {
      throw new Error('Connect a wallet to continue.');
    }

    setPaying(true);
    let pendingId: string | null = null;
    try {
      const quote = await quoteFee(kind);

      /*
       * No toast here, deliberately.
       *
       * There used to be one naming the amount, raised on this exact tick. It
       * could not be read: the next statement hands control to the wallet,
       * Android dims the screen and animates another app over the top, and the
       * toast spent its whole life behind that. Worse, it was the *only* place
       * the amount was ever stated, so the disclosure was simultaneously
       * mandatory and invisible - what the store reviewer described as a banner
       * that "instantly darkens so user cannot read clearly".
       *
       * The amount is now on the screen the user was already reading, before
       * they tapped anything - see `useFeeQuote` and `FeeDisclosure`. Repeating
       * it into a scrim adds nothing.
       */
      const { signature } = await walletService.signAndSendTransaction({
        type: 'transfer',
        to: TREASURY_ADDRESS,
        lamports: quote.lamports,
        /*
         * What the wallet shows on its approval sheet. Names the product, the
         * purpose and the amount, because the sheet's own summary is "transfer
         * N SOL to <address>" and that address means nothing to anyone.
         */
        memo: `Eventerz: ${FEE_LABEL[kind].toLowerCase()} ($${quote.usd}). Non-refundable.`,
      });

      /*
       * A signature means the wallet submitted it, not that it succeeded.
       *
       * On mainnet a submitted transfer still fails for ordinary reasons - most
       * often a balance that covers the fee but not the fee *plus* rent and the
       * network charge. Treating "submitted" as "paid" hands over a paid-for
       * event that nobody paid for.
       *
       * Only a confirmed failure stops the flow, and it is safe to stop on:
       * a failed transaction moved no money, so retrying costs the user
       * nothing. An undecided result deliberately proceeds - see below.
       */
      pendingId = toast.pending(
        'Confirming payment',
        'Waiting for the network to settle it.',
      );
      const settlement = await awaitSettlement(signature);
      toast.dismiss(pendingId);
      pendingId = null;

      if (settlement.status === 'failed') {
        throw new Error(`${settlement.error} You have not been charged.`);
      }

      /*
       * `unknown` proceeds on purpose.
       *
       * The transaction is very likely on its way; the RPC just has not caught
       * up. Reporting that as a failure would invite a retry, and a retry of a
       * non-refundable charge is how someone gets billed twice for one event.
       * Letting it through risks the far cheaper mistake instead.
       */
      haptics.success();
      void refreshBalance();
      return signature;
    } catch (error) {
      if (pendingId) toast.dismiss(pendingId);

      /*
       * Declining is a choice, not a fault - surface it as a cancellation so
       * the caller can stop quietly instead of showing a red error.
       *
       * This used to test `error.message` against a local regex that knew about
       * "user rejected", "declined", "denied" and "cancelled" - and therefore
       * did *not* match `java.util.concurrent.CancellationException`, which is
       * precisely what Mobile Wallet Adapter throws when someone backs out of
       * the approval sheet on Android. So the most ordinary action a user can
       * take at a payment prompt - changing their mind - fell through to the
       * generic branch below and put a raw Java class name in a red toast. A
       * dApp Store reviewer hit exactly that: *"Cancellation of txn results in
       * java related error messaging rather than user readable text."*
       *
       * `isWalletCancellation` is the shared rule that already knew this, used
       * by the connect flow since a near-identical rejection last time. There
       * is no reason for a second, weaker copy of it to exist here.
       */
      if (isWalletCancellation(error)) {
        throw new FeeCancelled();
      }

      haptics.error();

      /*
       * Everything else is translated too, for the same reason. `error.message`
       * at this boundary is a native exception or a JS TypeError far more often
       * than it is a sentence. `describeSigningError` keeps the real sentences
       * this hook throws itself - the SOL price failing, a confirmed on-chain
       * rejection - and replaces anything that reads like a class name or a
       * stack frame. It returns null only for cancellations, which the branch
       * above has already taken.
       */
      throw new Error(
        describeSigningError(error) ?? 'The fee could not be taken.',
      );
    } finally {
      setPaying(false);
    }
  }, [account, kind, refreshBalance]);

  return { payFee, paying };
}

/** Thrown when the user declined in their wallet. Not an error to shout about. */
export class FeeCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'FeeCancelled';
  }
}
