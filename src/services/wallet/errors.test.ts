import { describe, expect, it } from 'vitest';

import {
  describeSigningError,
  describeWalletError,
  isWalletCancellation,
  walletMessage,
} from './errors';

/**
 * What a user is allowed to be shown when a wallet fails.
 *
 * These assertions exist because two raw exception strings reached real users
 * and were cited in a dApp Store rejection ("We could not complete the account
 * access or onboarding flow needed to review the app"). The specific strings are
 * asserted against below so that neither can come back.
 */

/** MWA raises errors carrying a `code`; `messageOf` reads it. */
function mwaError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('the two failures that cost the submission', () => {
  it('never shows the Java cancellation exception', () => {
    const error = new Error('java.util.concurrent.CancellationException');
    expect(describeWalletError(error)).toBeNull();
    expect(isWalletCancellation(error)).toBe(true);
  });

  it('never shows the slice TypeError', () => {
    const error = new TypeError("Cannot read property 'slice' of null");
    const shown = describeWalletError(error);
    expect(shown).not.toBeNull();
    expect(shown).not.toMatch(/slice|null|TypeError/i);
    expect(shown).toMatch(/could not be connected/i);
  });
});

/**
 * The second rejection, and why signing needed its own translator.
 *
 * The connect flow was fixed after the first rejection; the *paying* flow was
 * not. `useFee` and the send sheet each carried their own regex - "user
 * rejected|declined|denied|cancell?ed" - which does not match
 * `CancellationException`, because after "cancell" comes an "a", not an "e".
 * So backing out of a payment prompt, the single most ordinary thing a user can
 * do there, put a Java class name in a red toast. The reviewer's words:
 * *"Cancellation of txn results in java related error messaging rather than
 * user readable text."*
 */
describe('cancelling a payment', () => {
  it('never shows the Java exception that caused the rejection', () => {
    const error = new Error('java.util.concurrent.CancellationException');
    expect(isWalletCancellation(error)).toBe(true);
    expect(describeSigningError(error)).toBeNull();
  });

  /*
   * The exact string the old regex let through, pinned so the weaker rule
   * cannot be reintroduced by someone rewriting either call site.
   */
  it('is not something a "cancell?ed" regex can catch', () => {
    expect(/user rejected|declined|denied|cancell?ed/i.test(
      'java.util.concurrent.CancellationException',
    )).toBe(false);
    // ...which is precisely why the shared rule is used instead.
    expect(isWalletCancellation(new Error('java.util.concurrent.CancellationException')))
      .toBe(true);
  });

  it('stays silent for the other ways a user backs out', () => {
    for (const message of [
      'User rejected the request',
      'declined',
      'The request was aborted',
      'Transaction cancelled',
    ]) {
      expect(describeSigningError(new Error(message))).toBeNull();
    }
  });
});

describe('describeSigningError', () => {
  it('does not offer "continue with Google" as a way to pay a fee', () => {
    // The connect-flow catch-all is wrong here: the wallet is already
    // connected, and Google is not a payment method.
    const shown = describeSigningError(new Error('kotlin.NotImplementedError'));
    expect(shown).not.toMatch(/Google/i);
    expect(shown).not.toMatch(/could not be connected/i);
    expect(shown).toMatch(/Nothing has been charged/i);
  });

  it('keeps the real sentences the fee path throws itself', () => {
    // `quoteFee` refusing, and a confirmed on-chain failure. Both are better
    // than anything this function could reconstruct, and both are plain
    // `Error`s rather than `WalletMessageError`s.
    expect(
      describeSigningError(
        new Error(
          'Could not check the SOL price, so the fee cannot be calculated. Try again in a moment.',
        ),
      ),
    ).toMatch(/Could not check the SOL price/);

    expect(
      describeSigningError(
        new Error(
          'Your wallet does not have enough SOL to cover this and the network fee. You have not been charged.',
        ),
      ),
    ).toMatch(/not have enough SOL/);
  });

  it('still refuses class names and stack fragments', () => {
    const inputs: unknown[] = [
      new Error('java.util.concurrent.TimeoutException'),
      new TypeError("Cannot read property 'slice' of null"),
      new Error('at com.solanamobile.Adapter.transact(Adapter.kt:88)'),
      'java.lang.SecurityException',
      new Error('TypeError: undefined is not an object'),
      null,
      42,
      {},
    ];

    for (const input of inputs) {
      const shown = describeSigningError(input);
      if (shown === null) continue;
      expect(shown).not.toMatch(/java\.|kotlin\.|TypeError|Cannot read propert|\bat\s+\w+\(/);
      expect(shown).toMatch(/[.!]$/);
    }
  });

  it('passes our own diagnoses through untouched', () => {
    expect(
      describeSigningError(walletMessage('That wallet did not share an account to pay with.')),
    ).toBe('That wallet did not share an account to pay with.');
  });

  it('tells the user nothing was charged when the network was unreachable', () => {
    const shown = describeSigningError(new Error('Network request failed'));
    expect(shown).toMatch(/nothing has been charged/i);
  });
});

describe('a diagnosis we made ourselves', () => {
  /*
   * The Seeker's built-in wallet authorized successfully and the app still
   * said "That wallet could not be connected." - because the adapter's precise
   * finding was thrown as a plain Error, matched none of the patterns below,
   * and was replaced by the catch-all. The useful half of the diagnosis was
   * computed and then discarded, on every wallet failure.
   */
  it('survives instead of being replaced by the catch-all', () => {
    const shown = describeWalletError(
      walletMessage('The wallet returned an address we could not read.'),
    );
    expect(shown).toBe('The wallet returned an address we could not read.');
    expect(shown).not.toMatch(/could not be connected/);
  });

  it('is never mistaken for a cancellation', () => {
    // These are only raised *after* a wallet has answered, so silencing one
    // would hide a real failure behind an empty screen.
    const error = walletMessage('That wallet did not share an account.');
    expect(isWalletCancellation(error)).toBe(false);
    expect(describeWalletError(error)).toBe(
      'That wallet did not share an account.',
    );
  });

  it('wins even when its wording overlaps a pattern', () => {
    // "cancelled" inside a sentence we wrote must not route it to silence.
    const error = walletMessage('The transfer was cancelled by the network.');
    expect(isWalletCancellation(error)).toBe(false);
    expect(describeWalletError(error)).toMatch(/cancelled by the network/);
  });
});

describe('describeWalletError', () => {
  it('names the real problem when no wallet is installed', () => {
    const shown = describeWalletError(
      mwaError(
        'ERROR_WALLET_NOT_FOUND',
        'Found no installed wallet that supports the mobile wallet protocol.',
      ),
    );
    expect(shown).toMatch(/No Solana wallet app/i);
    // The way out has to be in the message: this is the state a reviewer on a
    // wallet-less device lands in.
    expect(shown).toMatch(/Google/);
  });

  it('does not read "wallet not found" as a cancellation', () => {
    // Some devices report the two together; the actionable one must win.
    const error = mwaError(
      'ERROR_WALLET_NOT_FOUND',
      'CancellationException: no installed wallet',
    );
    expect(isWalletCancellation(error)).toBe(false);
    expect(describeWalletError(error)).toMatch(/No Solana wallet app/i);
  });

  it('says nothing when the user declined', () => {
    expect(describeWalletError(new Error('User rejected the request'))).toBeNull();
    expect(
      describeWalletError(mwaError('ERROR_AUTHORIZATION_FAILED', 'declined')),
    ).toBeNull();
  });

  it('explains an unlinked native module without naming it', () => {
    const shown = describeWalletError(
      new Error("The package 'solana-mobile-wallet-adapter-protocol' doesn't seem to be linked."),
    );
    expect(shown).toMatch(/not available in this build/i);
    expect(shown).not.toMatch(/package|linked|Lerna/i);
  });

  it('separates a network failure from a wallet failure', () => {
    expect(describeWalletError(new Error('Network request failed'))).toMatch(
      /connection/i,
    );
  });

  /*
   * Asserted identically in the website's `lib/wallet-errors.test.ts`.
   *
   * These are the cases where both platforms mean exactly the same thing, so
   * they say exactly the same thing. Testing onboarding on a Vercel preview
   * only predicts what the APK does if the two agree on their failure text, so
   * the shared sentences are pinned on both sides - a change to either breaks
   * the other's suite.
   */
  it('shares its wording with the website where the situation is shared', () => {
    expect(describeWalletError(new Error('Network request failed'))).toBe(
      'Could not reach the network while connecting. Check your connection and try again.',
    );
    expect(describeWalletError(new Error('kotlin.NotImplementedError'))).toBe(
      'That wallet could not be connected. You can try again, or continue with Google.',
    );
  });

  /*
   * The property that matters more than any single case: whatever goes in, what
   * comes out is either a sentence or nothing. Never a class name, never a
   * stack fragment, never the empty string.
   */
  it('always returns a sentence or nothing', () => {
    const inputs: unknown[] = [
      new Error(''),
      new Error('kotlin.NotImplementedError'),
      'java.lang.SecurityException',
      null,
      undefined,
      42,
      {},
    ];

    for (const input of inputs) {
      const shown = describeWalletError(input);
      if (shown === null) continue;
      expect(shown.length).toBeGreaterThan(0);
      expect(shown).not.toMatch(/^[a-z]+(\.[a-z]+)+/i); // no fully-qualified class names
      expect(shown).toMatch(/[.!]$/); // a finished sentence
    }
  });
});
