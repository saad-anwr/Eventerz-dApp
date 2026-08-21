/**
 * On-chain event claim - the host's signed statement that they published an
 * event.
 *
 * # What this is, and what it deliberately is not
 *
 * Publishing an event is free and writes a Postgres row. This adds one thing on
 * top: a transaction, signed by the host's wallet, whose **memo is the claim
 * itself** - "this address published this event, at this time". The cluster
 * timestamps it and anyone can read it back.
 *
 * That is a narrow promise, and it is kept exactly. The event is not stored on
 * Solana, its guest list is not on Solana, and nothing here mints anything. Say
 * "a signed record of authorship", never "your event is on-chain".
 *
 * # Why this is not the zero-lamport self-transfer that was removed
 *
 * `mobile-wallet-adapter.ts` used to answer un-implemented on-chain intents
 * with a 0-lamport transfer to self, and that was rightly deleted: it produced
 * a real, confirmable signature for a transaction containing no evidence of the
 * thing being claimed. The UI said "ticket minted" and the explorer appeared to
 * agree, while the chain actually recorded "this wallet sent itself nothing".
 *
 * The difference here is not the lamport count - it is that the memo carries
 * the claim. Decode this transaction and you get the assertion in full, checked
 * by the Memo program against the signer. What the chain records and what the
 * UI says are the same sentence, which is the property that was missing before.
 *
 * # Cost
 *
 * No lamports move. The host pays the Solana network fee (5,000 lamports) plus
 * whatever priority fee the network is asking - together well under a cent at
 * any plausible SOL price. There is no platform fee: creating an event is free.
 */

import type { PublicKey } from '@solana/web3.js';

import { memoInstruction } from './memo';

/**
 * Marks a memo as ours, cheaply greppable in an explorer.
 *
 * Deliberately not localised. This string is read by machines and by whoever is
 * squinting at a block explorer six months from now, neither of whom benefit
 * from it arriving in the host's device language.
 */
export const CLAIM_MEMO_PREFIX = 'eventerz:event-claim';

/**
 * The exact text signed and published.
 *
 * The event id is the load-bearing part: it is what binds this signature to one
 * specific event rather than to "some event by this host". The verifier looks
 * for it by substring, so this layout can gain fields without invalidating
 * claims already on-chain - which matters, because those cannot be re-signed.
 */
export function buildEventClaimMemo(eventId: string, host: string): string {
  return [
    CLAIM_MEMO_PREFIX,
    `event=${eventId}`,
    `host=${host}`,
    `at=${new Date().toISOString()}`,
  ].join(' ');
}

/**
 * Does this memo claim this event?
 *
 * Both halves are required. The prefix alone would match any Eventerz claim
 * including one for a different event, and the id alone would match a memo that
 * merely mentions the event - a payment note, a message quoted into a transfer.
 *
 * Case-insensitive on the id because UUIDs are hex and a wallet or explorer
 * round-tripping the text has no obligation to preserve case.
 */
export function memoClaimsEvent(memo: string, eventId: string): boolean {
  const text = memo.toLowerCase();
  return (
    text.includes(CLAIM_MEMO_PREFIX) && text.includes(eventId.toLowerCase())
  );
}

/** The single instruction a claim transaction carries. */
export function eventClaimInstruction(eventId: string, host: PublicKey) {
  // Signer named deliberately - see `memoInstruction`. In a memo-only
  // transaction it is what makes the text an attestation rather than a note.
  return memoInstruction(buildEventClaimMemo(eventId, host.toBase58()), host);
}
