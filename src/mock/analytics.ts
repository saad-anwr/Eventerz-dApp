/**
 * Organizer dashboard seeds - mirrors the numbers shown on the web app's
 * organizer section so the two dashboards tell the same story.
 */

import type { AnalyticsPoint, OrganizerStats, Registration } from '@/types';

const HOUR = 60 * 60 * 1000;

export const mockOrganizerStats: OrganizerStats = {
  eventsCreated: 12,
  ticketsMinted: 4821,
  revenueSol: 184.2,
  attendanceRate: 92,
  deltas: {
    eventsCreated: '+12%',
    ticketsMinted: '+34%',
    revenueSol: '+21%',
    attendanceRate: '+6%',
  },
};

/** Monthly ticket mints, 0-100 scale - drives the dashboard chart. */
export const mockMintsSeries: AnalyticsPoint[] = [
  { label: 'Jan', value: 32 },
  { label: 'Feb', value: 41 },
  { label: 'Mar', value: 38 },
  { label: 'Apr', value: 55 },
  { label: 'May', value: 62 },
  { label: 'Jun', value: 74 },
  { label: 'Jul', value: 68 },
  { label: 'Aug', value: 88 },
  { label: 'Sep', value: 96 },
];

/** Check-in rate by event, used for the secondary bar chart. */
export const mockAttendanceSeries: AnalyticsPoint[] = [
  { label: 'Summit', value: 94 },
  { label: 'cNFT', value: 88 },
  { label: 'Hack', value: 76 },
  { label: 'Design', value: 97 },
  { label: 'Seeker', value: 91 },
];

export function buildMockRegistrations(): Registration[] {
  const now = Date.now();
  const rows: [string, string, string, number][] = [
    ['u_ana', 'e_summit', 'AnaRojas1111111111111111111111111111111111', 0.4],
    ['u_priya', 'e_summit', 'PriyaNair9999999999999999999999999999999', 1.2],
    ['u_jonas', 'e_seeker', 'JonasBec5555555555555555555555555555555555', 2.6],
    ['u_leo', 'e_cnft', 'LeoMartn7777777777777777777777777777777777', 4.1],
    ['u_diego', 'e_hack', 'DiegoAlv3333333333333333333333333333333333', 6.5],
    ['u_nadia', 'e_dao_call', 'NadiaHad4444444444444444444444444444444444', 9.0],
    ['u_tom', 'e_design', 'TomWildr8888888888888888888888888888888888', 12.3],
  ];

  return rows.map(([userId, eventId, walletAddress, hoursAgo], i) => ({
    id: `r${i}`,
    userId,
    eventId,
    walletAddress,
    createdAt: now - hoursAgo * HOUR,
    status: i % 5 === 3 ? 'pending' : i % 7 === 6 ? 'waitlist' : 'confirmed',
  }));
}
