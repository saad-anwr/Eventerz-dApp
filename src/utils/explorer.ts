/**
 * Solana Explorer links.
 *
 * Pure string work, kept out of `services/solana/` on purpose: a receipt card
 * that wanted a link used to define its own copy rather than pull web3.js and
 * borsh into a list row. Three copies of the same two lines had drifted by the
 * time they were counted.
 */

import { integrationsConfig } from '@/constants';

/**
 * `?cluster=` for anything but mainnet, which the Explorer defaults to.
 *
 * `cluster` is a parameter because a payment receipt records the cluster it was
 * made on: opening a devnet signature on the build's current cluster would show
 * "transaction not found" for a transaction that exists.
 */
export function explorerTxUrl(
  signature: string,
  cluster: string = integrationsConfig.solanaNetwork,
): string {
  const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
