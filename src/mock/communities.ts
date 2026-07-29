/**
 * Communities — the same seven verticals the web app lists in its
 * "Built for every community" section, modelled as joinable entities.
 */

import type { Community } from '@/types';

export const mockCommunities: Community[] = [
  {
    id: 'c_daos',
    name: 'DAOs',
    description:
      'Coordinate governance meetups and gated member gatherings with verifiable attendance.',
    icon: 'Boxes',
    accent: 'purple',
    coverGradient: 'violet-purple',
    memberCount: 1240,
    eventCount: 38,
    tokenGated: true,
    verified: true,
    memberIds: ['u_nadia', 'u_maya', 'u_diego'],
  },
  {
    id: 'c_hackathons',
    name: 'Hackathons',
    description:
      'Run check-ins, bounties and POAPs for thousands of builders without a spreadsheet in sight.',
    icon: 'Rocket',
    accent: 'blue',
    coverGradient: 'indigo-blue',
    memberCount: 3810,
    eventCount: 64,
    tokenGated: false,
    verified: true,
    memberIds: ['u_priya', 'u_ana', 'u_jonas', 'u_diego'],
  },
  {
    id: 'c_universities',
    name: 'Universities',
    description:
      'Wallet-native clubs and campus events where attendance actually means something.',
    icon: 'GraduationCap',
    accent: 'cyan',
    coverGradient: 'blue-cyan',
    memberCount: 910,
    eventCount: 22,
    tokenGated: false,
    verified: false,
    memberIds: ['u_ana', 'u_tom'],
  },
  {
    id: 'c_creators',
    name: 'Creators',
    description:
      'Token-gate drops, IRL fan meetups and collectible tickets your audience keeps.',
    icon: 'Palette',
    accent: 'green',
    coverGradient: 'cyan-green',
    memberCount: 2140,
    eventCount: 51,
    tokenGated: true,
    verified: true,
    memberIds: ['u_kenji', 'u_leo'],
  },
  {
    id: 'c_meetups',
    name: 'Meetups',
    description:
      'Lightweight local events that stay verifiable, bot-free and effortless to run.',
    icon: 'Users',
    accent: 'purple',
    coverGradient: 'purple-blue',
    memberCount: 5420,
    eventCount: 187,
    tokenGated: false,
    verified: true,
    memberIds: ['u_jonas', 'u_maya', 'u_leo', 'u_tom'],
  },
  {
    id: 'c_startups',
    name: 'Startups',
    description:
      'Host demo days and investor mixers with wallet-level insight into who showed up.',
    icon: 'Building2',
    accent: 'blue',
    coverGradient: 'sky-cyan',
    memberCount: 760,
    eventCount: 19,
    tokenGated: false,
    verified: false,
    memberIds: ['u_sara', 'u_maya'],
  },
  {
    id: 'c_conferences',
    name: 'Conferences',
    description:
      'Sell NFT tickets and issue proof-of-attendance to global audiences at near-zero cost.',
    icon: 'Mic2',
    accent: 'cyan',
    coverGradient: 'fuchsia-purple',
    memberCount: 1630,
    eventCount: 44,
    tokenGated: false,
    verified: true,
    memberIds: ['u_maya', 'u_ana', 'u_nadia'],
  },
];
