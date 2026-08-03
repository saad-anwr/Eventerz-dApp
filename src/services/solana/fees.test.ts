/**
 * The v1.0.0 money-off invariant.
 *
 * v1.0.0 ships to the Solana dApp Store as a mainnet app that moves no real
 * money. That is a product decision enforced by two constants, and constants
 * are exactly the kind of thing that gets flipped during unrelated work and
 * noticed after a user has been charged.
 *
 * These tests fail loudly when mainnet money is switched back on. That is the
 * point: turning it on for a later release means deliberately updating this
 * file, which is a conversation rather than an accident.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/** Re-import the module with `solanaNetwork` mocked to a given cluster. */
async function loadWithCluster(solanaNetwork: string) {
  vi.resetModules();
  vi.doMock('@/constants/config', () => ({
    integrationsConfig: { solanaNetwork },
  }));
  return import('./fees');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('@/constants/config');
  vi.resetModules();
});

describe('v1.0.0 ships with real money switched off', () => {
  it('pauses every money path', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.REAL_MONEY_PAUSED).toBe(true);
  });

  it('takes no platform fee on mainnet', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.feesEnabled()).toBe(false);
  });

  it('moves no wallet-to-wallet transfer on mainnet', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.transfersEnabled()).toBe(false);
  });
});

describe('devnet stays usable for testing', () => {
  /*
   * Devnet SOL is free, so the concern the master switch exists for does not
   * apply there. Transfers staying available is what keeps the feature
   * exercisable before it is turned back on for real users.
   */
  it('still allows transfers on devnet', async () => {
    const fees = await loadWithCluster('devnet');
    expect(fees.transfersEnabled()).toBe(true);
  });

  it('still takes no fee on devnet', async () => {
    const fees = await loadWithCluster('devnet');
    expect(fees.feesEnabled()).toBe(false);
  });
});

describe('the treasury is a bundle constant', () => {
  /*
   * The recipient of every fee is fixed in the bundle rather than passed in by
   * a screen. Fees are irreversible, so a caller-supplied recipient is a
   * recipient an attacker can swap.
   */
  it('is a fixed address', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.TREASURY_ADDRESS).toBe(
      'HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781Pw5oJ',
    );
  });
});
