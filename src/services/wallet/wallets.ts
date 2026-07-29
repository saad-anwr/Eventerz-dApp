/**
 * The wallets Eventerz offers, in display order.
 *
 * Seeker's built-in wallet leads because on Solana Mobile hardware it is the
 * zero-friction path — Mobile Wallet Adapter talks to it without an app switch.
 */

import type { WalletDescriptor } from '@/types';

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
  },
  {
    id: 'solflare',
    name: 'Solflare',
    tagline: 'Staking and hardware support',
    color: '#ffc10a',
    downloadUrl: 'https://solflare.com/download',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    tagline: 'xNFT-native wallet',
    color: '#e33e3f',
    downloadUrl: 'https://backpack.app/download',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    tagline: 'Swap-first mobile wallet',
    color: '#22d3ee',
    downloadUrl: 'https://jup.ag/mobile',
  },
];

export function getWalletDescriptor(id: string): WalletDescriptor | undefined {
  return SUPPORTED_WALLETS.find((w) => w.id === id);
}
