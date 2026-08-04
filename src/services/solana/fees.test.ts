/**
 * What the app charges, and what it refuses to charge.
 *
 * These fees are real money on mainnet, non-refundable and irreversible - there
 * is no chargeback and no support tool to undo one. So the amounts, the
 * recipient and the on/off state are all pinned here: changing any of them
 * means deliberately editing this file, which is a conversation rather than an
 * accident during unrelated work.
 *
 * This file previously asserted the opposite - that no money moved at all. That
 * was the v1.0.0 launch posture, and it failed loudly when fees were turned on,
 * which is what it was for.
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

describe('platform fees are live on mainnet', () => {
  it('is not paused', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.FEES_PAUSED).toBe(false);
  });

  it('charges on mainnet', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.feesEnabled()).toBe(true);
  });

  it('charges the agreed amounts', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.FEE_USD.createEvent).toBe(5);
    expect(fees.FEE_USD.rsvp).toBe(1);
  });

  /*
   * The recipient is a bundle constant, never passed in by a screen. Fees are
   * irreversible, so a caller-supplied recipient is a recipient an attacker can
   * swap.
   */
  it('pays a fixed treasury', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.TREASURY_ADDRESS).toBe(
      'HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781Pw5oJ',
    );
  });
});

describe('devnet is free', () => {
  /*
   * Devnet SOL has no value, so charging there is theatre that only makes
   * testing harder.
   */
  it('takes no fee off mainnet', async () => {
    const fees = await loadWithCluster('devnet');
    expect(fees.feesEnabled()).toBe(false);
  });
});

describe('DM transfers stay off, independently of fees', () => {
  /*
   * A platform fee is Eventerz charging for a service. A DM transfer is two
   * users paying each other with Eventerz as neither party. Turning the first
   * on says nothing about the second, and these tests exist so the two cannot
   * drift back into one switch.
   */
  it('moves no wallet-to-wallet transfer on mainnet', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.TRANSFERS_PAUSED).toBe(true);
    expect(fees.transfersEnabled()).toBe(false);
  });

  it('still allows transfers on devnet for testing', async () => {
    const fees = await loadWithCluster('devnet');
    expect(fees.transfersEnabled()).toBe(true);
  });

  it('fees being on has not switched transfers on', async () => {
    const fees = await loadWithCluster('mainnet-beta');
    expect(fees.feesEnabled()).toBe(true);
    expect(fees.transfersEnabled()).toBe(false);
  });
});
