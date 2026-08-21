/**
 * SPL Memo - the only part of a transaction a wallet can read aloud.
 *
 * # Why this exists at all
 *
 * `TransactionIntent` has carried a `memo` field for as long as transfers have
 * existed. `useFee` sets it to name the platform fee; the send sheet passes
 * whatever the user typed. None of it ever reached the chain - the adapter
 * built the `SystemProgram.transfer` and dropped the memo on the floor,
 * silently, because nothing ever read the field back.
 *
 * The consequence was not cosmetic. A wallet's approval sheet is the one screen
 * a user actually reads before money moves, and with no memo it can only say
 * "transfer N SOL to <address>" - an address that means nothing to anyone. The
 * dApp Store review said exactly that: *"Transaction then simulates to state
 * SOL deduction without clarity on what for."*
 *
 * Kept in its own module, free of `@solana-mobile/*`, so it can be unit-tested
 * without a native association intent - which is also why the adapter's
 * instruction builders are pure functions.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';

/** SPL Memo v2 - what explorers and wallets decode. */
export const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

/**
 * Conservative byte budget.
 *
 * A transaction has a hard 1232-byte limit, and an over-long memo does not
 * degrade gracefully - it makes the whole transfer fail to serialise, turning a
 * long note into a payment that cannot be sent at all.
 */
export const MAX_MEMO_BYTES = 320;

/**
 * Trim to a byte budget without splitting a character.
 *
 * The limit is bytes; UTF-8 characters are one to four of them. Cutting at a
 * byte offset can leave a dangling continuation sequence, which is not valid
 * UTF-8 and renders as a replacement glyph in whatever shows it next - so any
 * partial character at the end is dropped rather than kept.
 */
export function truncateMemoBytes(text: string): Buffer {
  let bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= MAX_MEMO_BYTES) return bytes;

  bytes = bytes.subarray(0, MAX_MEMO_BYTES);

  // Walk back over continuation bytes (10xxxxxx)...
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  // ...then drop the lead byte they belonged to, if it is now orphaned.
  if (end > 0 && (bytes[end - 1]! & 0b1000_0000) !== 0) {
    end -= 1;
  }

  return bytes.subarray(0, end);
}

/** The instruction that puts `text` on-chain beside a transfer. */
export function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({
    // Memo v2 accepts zero accounts. Naming the payer as a signer would be
    // valid too, and would add nothing the transfer does not already prove.
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: truncateMemoBytes(text),
  });
}
