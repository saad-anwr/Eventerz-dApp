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

import { useCallback, useState } from 'react';

import {
  FEE_LABEL,
  TREASURY_ADDRESS,
  feesEnabled,
  formatFeeSol,
  quoteFee,
  type FeeKind,
} from '@/services/solana/fees';
import { awaitSettlement } from '@/services/solana/rpc';
import { walletService } from '@/services/wallet';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { haptics } from '@/utils/haptics';

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

      toast.info(
        FEE_LABEL[kind],
        `${formatFeeSol(quote.lamports)} (about $${quote.usd}). Approve in your wallet.`,
      );

      const { signature } = await walletService.signAndSendTransaction({
        type: 'transfer',
        to: TREASURY_ADDRESS,
        lamports: quote.lamports,
        memo: `Eventerz ${FEE_LABEL[kind].toLowerCase()}`,
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
      haptics.error();
      const message =
        error instanceof Error ? error.message : 'The fee could not be taken.';

      // Declining is a choice, not a fault - surface it as a cancellation so
      // the caller can stop quietly instead of showing a red error.
      if (/user rejected|declined|denied|cancell?ed/i.test(message)) {
        throw new FeeCancelled();
      }
      throw new Error(message);
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
