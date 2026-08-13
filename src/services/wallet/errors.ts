/**
 * Wallet failures, in words a person can act on.
 *
 * # Why this exists
 *
 * The connect sheet showed `state.error` verbatim, and `state.error` was
 * whatever `Error.message` happened to be. Two of those reached real users and
 * cost the dApp Store submission:
 *
 *     Connection failed
 *     java.util.concurrent.CancellationException
 *
 *     Connection failed
 *     Cannot read property 'slice' of null
 *
 * The first is a Java class name. Mobile Wallet Adapter's `handleError` rethrows
 * the native error untouched when it carries no `code` (`case void 0: throw e`),
 * so a cancelled association surfaces as its exception name. The second is a JS
 * TypeError - see `toBase58` in `mobile-wallet-adapter.ts` for the null that
 * produced it.
 *
 * Neither tells the person holding the phone anything, and a reviewer who taps
 * "connect" and is shown a stack-trace fragment reasonably concludes the
 * onboarding flow is broken. That was the stated rejection reason.
 *
 * # The rule
 *
 * Nothing from a wallet reaches a user unmapped. `describeWalletError` always
 * returns a sentence; when it recognises nothing it returns a generic one
 * rather than passing the raw text through, because the raw text at this
 * boundary is a native exception rather than a message written for anybody.
 */

/** Codes MWA sets on the errors it raises. */
const WALLET_NOT_FOUND = /ERROR_WALLET_NOT_FOUND|no installed wallet/i;

/**
 * A cancelled association is a decision, not a failure.
 *
 * Backing out of the wallet's approval screen, or dismissing Android's picker,
 * lands here. `CancellationException` is what the native side throws; MWA also
 * has a declined-authorization path. Neither deserves a red toast - the user
 * did exactly what they meant to.
 */
const CANCELLED =
  /CancellationException|ERROR_AUTHORIZATION_FAILED|declined|cancell?ed|user rejected|aborted/i;

const NOT_LINKED =
  /doesn't seem to be linked|not.*linked|only compatible with React Native Android/i;

export function isWalletCancellation(error: unknown): boolean {
  const message = messageOf(error);
  // Order matters: "wallet not found" must not be read as a cancellation, and
  // some devices report it with a cancellation wrapped around it.
  if (WALLET_NOT_FOUND.test(message)) return false;
  return CANCELLED.test(message);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return `${typeof code === 'string' ? `${code} ` : ''}${error.message}`;
  }
  return typeof error === 'string' ? error : '';
}

/**
 * Turn any wallet failure into a sentence.
 *
 * @param error - whatever was thrown.
 * @returns A message to show, or `null` when the user simply cancelled and
 *   should be shown nothing at all.
 */
export function describeWalletError(error: unknown): string | null {
  const message = messageOf(error);

  if (WALLET_NOT_FOUND.test(message)) {
    return 'No Solana wallet app was found on this device. Install one - or continue with Google, which needs no wallet.';
  }

  if (isWalletCancellation(error)) return null;

  if (NOT_LINKED.test(message)) {
    return 'Wallet support is not available in this build. Continue with Google instead.';
  }

  if (/network|timeout|unreachable|failed to fetch/i.test(message)) {
    return 'Could not reach the network while connecting. Check your connection and try again.';
  }

  /*
   * Anything unrecognised. Deliberately does *not* fall through to the raw
   * message: everything reaching this line is a native exception or a JS
   * TypeError, and showing either is what put a stack-trace fragment in front
   * of a store reviewer.
   */
  return 'That wallet could not be connected. You can try again, or continue with Google.';
}
