import { db } from '@/mock';
import type { Community } from '@/types';
import { mockDelay } from '@/utils';

export const communityRepository = {
  async list(): Promise<Community[]> {
    await mockDelay();
    return Object.values(db.communities).sort(
      (a, b) => b.memberCount - a.memberCount,
    );
  },

  /** Communities with the most momentum — Home's "Trending" rail. */
  async listTrending(limit = 5): Promise<Community[]> {
    await mockDelay();
    return Object.values(db.communities)
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, limit);
  },

  async getById(id: string): Promise<Community | null> {
    await mockDelay();
    return db.communities[id] ?? null;
  },

  async listByMember(userId: string): Promise<Community[]> {
    await mockDelay();
    return Object.values(db.communities).filter((c) =>
      c.memberIds.includes(userId),
    );
  },

  async toggleMembership(id: string, userId: string): Promise<Community> {
    await mockDelay();
    const community = db.communities[id];
    if (!community) throw new Error(`Community ${id} not found`);
    const joined = community.memberIds.includes(userId);
    const memberIds = joined
      ? community.memberIds.filter((m) => m !== userId)
      : [...community.memberIds, userId];
    const next: Community = {
      ...community,
      memberIds,
      memberCount: community.memberCount + (joined ? -1 : 1),
    };
    db.communities[id] = next;
    return next;
  },
};
