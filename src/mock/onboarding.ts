/** Copy for the three onboarding slides — drawn from the web app's features. */

export interface OnboardingSlide {
  id: string;
  /** Lucide icon name. */
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: 'purple' | 'blue' | 'cyan';
}

export const onboardingSlides: OnboardingSlide[] = [
  {
    id: 'wallet-native',
    icon: 'Wallet',
    eyebrow: 'No passwords. Ever.',
    title: 'Wallet-native Events',
    body: 'Your wallet is your identity. Connect once with Seeker, Phantom, Backpack or Solflare and every RSVP becomes a verifiable, bot-proof transaction.',
    accent: 'purple',
  },
  {
    id: 'nft-tickets',
    icon: 'Ticket',
    eyebrow: 'Fractions of a cent',
    title: 'NFT Tickets',
    body: 'Compressed NFT tickets land in your wallet the moment you RSVP. Soulbound or transferable — the organizer sets the rules, you keep the collectible.',
    accent: 'blue',
  },
  {
    id: 'reputation',
    icon: 'Trophy',
    eyebrow: 'Owned by you',
    title: 'On-chain Reputation',
    body: 'Every check-in drops a Proof-of-Attendance badge and raises a portable score that unlocks token-gated rooms across every community you touch.',
    accent: 'cyan',
  },
];
