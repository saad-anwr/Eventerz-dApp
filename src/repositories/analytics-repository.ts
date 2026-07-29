import {
  db,
  mockAttendanceSeries,
  mockMintsSeries,
  mockOrganizerStats,
} from '@/mock';
import type { AnalyticsPoint, OrganizerStats, Registration } from '@/types';
import { mockDelay } from '@/utils';

export const analyticsRepository = {
  /**
   * Organizer headline numbers. Events the user actually created are counted
   * live so the dashboard reacts to the Create flow instead of staying static.
   */
  async getOrganizerStats(hostId: string): Promise<OrganizerStats> {
    await mockDelay();
    const hosted = Object.values(db.events).filter((e) => e.hostId === hostId);
    if (hosted.length === 0) return mockOrganizerStats;
    return {
      ...mockOrganizerStats,
      eventsCreated: mockOrganizerStats.eventsCreated + hosted.length,
    };
  },

  async getMintsSeries(): Promise<AnalyticsPoint[]> {
    await mockDelay();
    return mockMintsSeries;
  },

  async getAttendanceSeries(): Promise<AnalyticsPoint[]> {
    await mockDelay();
    return mockAttendanceSeries;
  },

  async listRecentRegistrations(limit = 6): Promise<Registration[]> {
    await mockDelay();
    return [...db.registrations]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
};
