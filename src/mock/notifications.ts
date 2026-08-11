import type { AppNotification } from '@/types';

import { MOCK_TICKET_IDS } from './tickets';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function buildMockNotifications(): AppNotification[] {
  const now = Date.now();
  return [
    {
      id: 'n1',
      kind: 'ticket',
      title: 'NFT ticket minted',
      body: 'Your ticket for Solana Superteam Summit landed in your wallet. Serial #42.',
      createdAt: now - 22 * MIN,
      read: false,
      href: `/ticket/${MOCK_TICKET_IDS.summit}`,
    },
    {
      id: 'n2',
      kind: 'event-reminder',
      title: 'Starts in 2 days',
      body: 'AMA: Scaling Validators on Solana begins Thursday at 5:00 PM.',
      createdAt: now - 3 * HOUR,
      read: false,
      href: '/event/e_ama',
    },
    {
      id: 'n3',
      kind: 'wallet',
      title: 'Wallet connected',
      body: 'Seeker wallet linked to your Eventerz profile on devnet.',
      createdAt: now - 5 * HOUR,
      read: true,
    },
    {
      id: 'n4',
      kind: 'community',
      title: 'Seeker Builders posted an update',
      body: 'Venue confirmed - Norrsken House, Stockholm. Doors at 6:00 PM.',
      createdAt: now - 1 * DAY,
      read: true,
      href: '/event/e_seeker',
    },
    {
      id: 'n5',
      kind: 'reputation',
      title: 'Reputation +40',
      body: 'Checking in at Breakpoint Mobile Night raised your score to 690.',
      createdAt: now - 2 * DAY,
      read: true,
    },
    {
      id: 'n6',
      kind: 'community',
      title: 'Approved for cNFT Night',
      body: 'Kenji approved your request. Your token gate check passed.',
      createdAt: now - 3 * DAY,
      read: true,
      href: '/event/e_cnft',
    },
    {
      id: 'n7',
      kind: 'system',
      title: 'Proof-of-Attendance dropped',
      body: 'A POAP badge from Rust for Solana was added to your profile.',
      createdAt: now - 5 * DAY,
      read: true,
      href: '/profile',
    },
  ];
}
