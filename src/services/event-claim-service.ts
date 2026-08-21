/**
 * Publish a host's on-chain claim, then have the server verify it.
 *
 * Two steps that must both happen, in this order, and only the second one puts
 * anything in the database:
 *
 *   1. The wallet signs and sends a memo-only transaction naming the event.
 *   2. `claim-event` reads that transaction back off the cluster, checks the
 *      signer is a wallet linked to this host and the memo names this event,
 *      and only then writes `events.onchain_signature`.
 *
 * Step 2 is not a formality. The client could send any string it liked, which
 * is exactly why `onchain_signature` has no client write grant - see the Edge
 * Function's header. Nothing here can shortcut it.
 */

import { integrationsConfig } from '@/constants/config';
import { client } from '@/repositories/supabase/client';
import { solanaService } from '@/services/solana-service';
import { describeSigningError, isWalletCancellation } from '@/services/wallet/errors';

export type ClaimFailure =
  /** The wallet prompt was dismissed. Not an error - see `isWalletCancellation`. */
  | 'cancelled'
  /** Signed and sent, but the server would not or could not attach it. */
  | 'unverified'
  /** Never reached the chain. */
  | 'send-failed';

export interface ClaimResult {
  ok: boolean;
  failure?: ClaimFailure;
  signature?: string;
  explorerUrl?: string;
  /** Safe to show a host. Never a raw RPC string. */
  message?: string;
}

/**
 * Ask the server to verify and record a signature that is already on-chain.
 *
 * Split out from `claimEvent` because it is independently useful: a claim whose
 * transaction landed but whose verification call failed is recoverable by
 * calling *this* again, with no second signature and no second network fee. The
 * transaction is already public; re-signing would only cost the host another
 * 5,000 lamports to prove the same fact twice.
 */
export async function recordEventClaim(
  eventId: string,
  signature: string,
): Promise<ClaimResult> {
  try {
    const { data, error } = await client().functions.invoke('claim-event', {
      body: {
        eventId,
        signature,
        cluster: integrationsConfig.solanaNetwork,
      },
    });

    if (error) {
      return {
        ok: false,
        failure: 'unverified',
        signature,
        message: 'The claim was signed but could not be recorded yet.',
      };
    }

    const result = data as { claimed?: boolean; detail?: string } | null;
    if (result?.claimed) return { ok: true, signature };

    return {
      ok: false,
      failure: 'unverified',
      signature,
      // The function's `detail` is written for a host to read - "that
      // transaction has not landed yet", "not signed by a wallet linked to your
      // account". Passing it through beats replacing it with something vaguer.
      message: result?.detail ?? 'The claim could not be verified yet.',
    };
  } catch {
    return {
      ok: false,
      failure: 'unverified',
      signature,
      message: 'The claim was signed but could not be recorded yet.',
    };
  }
}

/**
 * Sign a claim for `eventId`, then record it.
 *
 * **Never throws.** Every failure is a `ClaimResult`, because every caller so
 * far is publishing an event that already exists and must not be undone by a
 * dismissed wallet prompt. A thrown error here would propagate into a create
 * flow whose event is already live, and turn "your claim is not signed" into
 * "publishing failed" - which would be a lie, and would send the host round the
 * six-step wizard again to make a duplicate.
 */
export async function claimEvent(eventId: string): Promise<ClaimResult> {
  let signature: string;
  let explorerUrl: string;

  try {
    const result = await solanaService.claimEvent(eventId);
    signature = result.signature;
    explorerUrl = result.explorerUrl;
  } catch (error) {
    if (isWalletCancellation(error)) {
      return { ok: false, failure: 'cancelled' };
    }
    return {
      ok: false,
      failure: 'send-failed',
      // `describeSigningError` returns null for anything it cannot phrase
      // safely, rather than leaking an RPC string to a host.
      message:
        describeSigningError(error) ?? 'The claim could not be signed.',
    };
  }

  const recorded = await recordEventClaim(eventId, signature);
  return { ...recorded, explorerUrl };
}
