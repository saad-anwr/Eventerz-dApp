/**
 * The memo is the wallet's only chance to say what a payment is for.
 *
 * These assertions exist because the field was accepted, passed by every
 * caller, and then silently discarded before it reached the transaction - so
 * the approval sheet showed a bare SOL transfer to an unfamiliar address. The
 * dApp Store cited it: *"Transaction then simulates to state SOL deduction
 * without clarity on what for."*
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_MEMO_BYTES,
  MEMO_PROGRAM_ID,
  memoInstruction,
  truncateMemoBytes,
} from './memo';

describe('memoInstruction', () => {
  it('targets SPL Memo v2, which is what wallets actually decode', () => {
    expect(MEMO_PROGRAM_ID.toBase58()).toBe(
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    );
  });

  it('carries the text as UTF-8 with no accounts', () => {
    const instruction = memoInstruction('Eventerz: event creation fee ($5).');
    expect(instruction.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(instruction.keys).toHaveLength(0);
    expect(instruction.data.toString('utf8')).toBe(
      'Eventerz: event creation fee ($5).',
    );
  });

  /*
   * The property that matters for the rejection: whatever the fee path writes,
   * a wallet decoding this instruction gets a sentence naming the product, the
   * purpose and the amount - not an opaque transfer.
   */
  it('makes the charge legible to a wallet', () => {
    const decoded = memoInstruction(
      'Eventerz: event creation fee ($5). Non-refundable.',
    ).data.toString('utf8');

    expect(decoded).toMatch(/Eventerz/);
    expect(decoded).toMatch(/\$5/);
    expect(decoded).toMatch(/non-refundable/i);
  });
});

describe('truncateMemoBytes', () => {
  it('leaves a normal memo alone', () => {
    const text = 'Thanks for dinner';
    expect(truncateMemoBytes(text).toString('utf8')).toBe(text);
  });

  it('caps an over-long memo at the byte budget', () => {
    const bytes = truncateMemoBytes('a'.repeat(MAX_MEMO_BYTES * 2));
    expect(bytes.length).toBe(MAX_MEMO_BYTES);
  });

  /*
   * A user-supplied memo can be any script. Cutting mid-character would emit a
   * dangling continuation byte - invalid UTF-8, which renders as a replacement
   * glyph wherever it is shown next.
   */
  it('never splits a multi-byte character', () => {
    // Four bytes each, so the budget lands mid-character on some boundary.
    const text = '🎟️'.repeat(200);
    const bytes = truncateMemoBytes(text);

    expect(bytes.length).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    // Round-trips cleanly: no U+FFFD anywhere.
    const decoded = bytes.toString('utf8');
    expect(decoded).not.toMatch(/�/);
    expect(Buffer.from(decoded, 'utf8').length).toBe(bytes.length);
  });

  it('handles a three-byte script the same way', () => {
    const bytes = truncateMemoBytes('日本語のイベント'.repeat(100));
    expect(bytes.length).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    expect(bytes.toString('utf8')).not.toMatch(/�/);
  });

  it('survives an empty memo', () => {
    expect(truncateMemoBytes('').length).toBe(0);
  });
});
