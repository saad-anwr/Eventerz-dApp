/**
 * Ticket pricing in the create-event draft.
 *
 * The `price` column is `text` and shared with the website, so the string
 * `formatPrice` produces is the contract between the two products. Kept in step
 * with `Eventerz/lib/price.test.ts`.
 *
 * The validation half is here for a separate reason: it is the only thing
 * standing between a host and publishing a paid event with no price on it.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CREATE_STEPS,
  EMPTY_DRAFT,
  PRICE_CURRENCIES,
  formatPrice,
  useCreateEventStore,
} from './create-event-store';

const ACCESS_STEP = CREATE_STEPS.findIndex((s) => s.id === 'access');

beforeEach(() => {
  useCreateEventStore.getState().reset();
});

describe('PRICE_CURRENCIES', () => {
  /*
   * Pinned as an exact list, not a length. Both settle natively on Solana;
   * adding a third is a product decision about what a host can be paid in, and
   * it should fail this test rather than arrive with a UI tweak.
   */
  it('offers SOL and USDC', () => {
    expect(PRICE_CURRENCIES).toEqual(['SOL', 'USDC']);
  });
});

describe('formatPrice', () => {
  it('joins the amount to its currency', () => {
    expect(formatPrice({ isFree: false, price: '0.5', priceCurrency: 'SOL' })).toBe(
      '0.5 SOL',
    );
    expect(formatPrice({ isFree: false, price: '25', priceCurrency: 'USDC' })).toBe(
      '25 USDC',
    );
  });

  /*
   * The currency is never assumed. A USDC price rendered as SOL is off by
   * whatever SOL costs that day, and nothing downstream can detect it because
   * both are valid strings.
   */
  it('never silently defaults to SOL', () => {
    expect(
      formatPrice({ isFree: false, price: '1', priceCurrency: 'USDC' }),
    ).not.toContain('SOL');
  });

  /*
   * `isFree` wins outright. The amount is deliberately *kept* in the draft when
   * a host toggles free on - so that toggling back restores what they typed -
   * which means a stale amount is always sitting behind the switch, and this is
   * what stops it reaching the event.
   */
  it('reads a free event as Free even with an amount still in the draft', () => {
    expect(formatPrice({ isFree: true, price: '0.5', priceCurrency: 'SOL' })).toBe(
      'Free',
    );
  });

  it('reads a paid event with no amount as Free', () => {
    expect(formatPrice({ isFree: false, price: '', priceCurrency: 'SOL' })).toBe(
      'Free',
    );
  });
});

describe('the Access step will not pass a paid event with no price', () => {
  function fillAccess(fields: Partial<typeof EMPTY_DRAFT>) {
    const { setField } = useCreateEventStore.getState();
    useCreateEventStore.setState({ step: ACCESS_STEP });
    for (const [key, value] of Object.entries(fields)) {
      setField(key as keyof typeof EMPTY_DRAFT, value as never);
    }
  }

  it('advances a free event without an amount', () => {
    fillAccess({ isFree: true, price: '' });
    expect(useCreateEventStore.getState().validateStep()).toBe(true);
  });

  it('advances a paid event with an amount', () => {
    fillAccess({ isFree: false, price: '0.5', priceCurrency: 'USDC' });
    expect(useCreateEventStore.getState().validateStep()).toBe(true);
  });

  it('blocks a paid event with no amount', () => {
    fillAccess({ isFree: false, price: '' });
    expect(useCreateEventStore.getState().validateStep()).toBe(false);
    expect(useCreateEventStore.getState().errors.price).toBeTruthy();
  });

  /*
   * Zero is the case the old `/\d/` check let through: it contains a digit, so
   * it passed. A 0 SOL ticket is a paid event that charges nothing - free to a
   * guest, paid to every code path behind it. A host who means free has a
   * switch that says so on the event.
   */
  it('blocks a paid event priced at zero', () => {
    fillAccess({ isFree: false, price: '0' });
    expect(useCreateEventStore.getState().validateStep()).toBe(false);
  });
});

describe('toInput composes the stored price', () => {
  it('writes the amount with its currency, not the bare number', () => {
    const { setField } = useCreateEventStore.getState();
    setField('title', 'Solana Meetup');
    setField('description', 'A long enough description to pass validation.');
    setField('isFree', false);
    setField('price', '12');
    setField('priceCurrency', 'USDC');

    expect(useCreateEventStore.getState().toInput().price).toBe('12 USDC');
  });

  it('writes Free for a free event', () => {
    useCreateEventStore.getState().setField('isFree', true);
    expect(useCreateEventStore.getState().toInput().price).toBe('Free');
  });
});
