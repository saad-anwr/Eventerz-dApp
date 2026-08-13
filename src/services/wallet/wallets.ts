/**
 * The wallets Eventerz offers, in display order.
 *
 * Seeker's built-in wallet leads because on Solana Mobile hardware it is the
 * zero-friction path - Mobile Wallet Adapter talks to it without an app switch.
 */

import type { WalletDescriptor, WalletId } from '@/types';

export const SUPPORTED_WALLETS: WalletDescriptor[] = [
  {
    id: 'seeker',
    name: 'Solana Wallet',
    tagline: 'Built into your Seeker',
    color: '#14f195',
    downloadUrl: 'https://solanamobile.com/',
    native: true,
  },
  {
    id: 'phantom',
    name: 'Phantom',
    tagline: 'Most popular on Solana',
    color: '#ab9ff2',
    downloadUrl: 'https://phantom.app/download',
    uriBaseHost: 'phantom.app',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    tagline: 'Staking and hardware support',
    color: '#ffc10a',
    downloadUrl: 'https://solflare.com/download',
    uriBaseHost: 'solflare.com',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    tagline: 'xNFT-native wallet',
    color: '#e33e3f',
    downloadUrl: 'https://backpack.app/download',
    uriBaseHost: 'backpack.app',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    tagline: 'Swap-first mobile wallet',
    color: '#22d3ee',
    downloadUrl: 'https://jup.ag/mobile',
    uriBaseHost: 'jup.ag',
  },
];

export function getWalletDescriptor(id: string): WalletDescriptor | undefined {
  return SUPPORTED_WALLETS.find((w) => w.id === id);
}

/**
 * Which of these wallets answered an association, judged by the
 * `wallet_uri_base` it reported at authorization.
 *
 * # Why this is needed at all
 *
 * Tapping a row in the connect sheet does not choose a wallet. Every row fires
 * the same `solana-wallet://` association intent and Android decides which app
 * handles it - so the tapped id is a guess, and it was being recorded as fact.
 * Connect through the Phantom row, pick Solflare in the chooser, and the app
 * called it Phantom for the rest of the session.
 *
 * `null` for a wallet we do not list, including the Seeker's built-in one,
 * which is not reached by an `https` base. A null is not a failure - it means
 * "no better answer than the one we already had".
 *
 * Lives here rather than in the adapter so it can be tested: the adapter
 * imports the Mobile Wallet Adapter protocol at module scope, which is native
 * code and cannot be loaded in a test runner.
 */
export function walletIdFromUriBase(
  uriBase: string | undefined,
): WalletId | null {
  if (!uriBase) return null;

  let host: string;
  try {
    host = new URL(uriBase).hostname.toLowerCase();
  } catch {
    return null;
  }

  // `www.` on either side is the same wallet.
  const strip = (h: string) => h.replace(/^www\./, '');
  const match = SUPPORTED_WALLETS.find(
    (wallet) =>
      wallet.uriBaseHost !== undefined &&
      strip(wallet.uriBaseHost) === strip(host),
  );

  return match?.id ?? null;
}
