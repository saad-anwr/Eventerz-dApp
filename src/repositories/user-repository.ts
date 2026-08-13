import { db } from '@/mock';
import type { User } from '@/types';
import { mockDelay, uid } from '@/utils';

export const userRepository = {
  async getById(id: string): Promise<User | null> {
    await mockDelay();
    return db.users[id] ?? null;
  },

  /** Batch lookup - used by attendee rows so one call fills a whole list. */
  async getMany(ids: string[]): Promise<User[]> {
    await mockDelay();
    return ids.map((id) => db.users[id]).filter((u): u is User => Boolean(u));
  },

  async search(query: string): Promise<User[]> {
    await mockDelay();
    const q = query.trim().toLowerCase();
    const all = Object.values(db.users);
    if (!q) return all;
    return all.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.handle.toLowerCase().includes(q) ||
        (u.bio ?? '').toLowerCase().includes(q),
    );
  },

  /**
   * Find the profile bound to a wallet address, creating one on first connect.
   * This is the mobile equivalent of the web store's `ensureWalletUser`.
   */
  async ensureWalletUser(address: string): Promise<User> {
    await mockDelay();
    // Mirrors the guard in the Supabase repository - see the note there. The
    // `slice` calls below are what turned a null address into a crash toast.
    if (typeof address !== 'string' || address.length === 0) {
      throw new Error('That wallet did not provide a usable address.');
    }

    const existing = Object.values(db.users).find(
      (u) => u.walletAddress === address,
    );
    if (existing) return existing;

    const user: User = {
      id: uid('u'),
      name: `${address.slice(0, 4)}...${address.slice(-4)}`,
      handle: `sol${address.slice(0, 6).toLowerCase()}`,
      walletAddress: address,
      authMethod: 'wallet',
      reputation: 690,
      interests: ['Mobile', 'Hackathons', 'NFTs'],
      createdAt: Date.now(),
    };
    db.users[user.id] = user;
    return user;
  },

  async update(id: string, patch: Partial<User>): Promise<User> {
    await mockDelay();
    const current = db.users[id];
    if (!current) throw new Error(`User ${id} not found`);
    const next = { ...current, ...patch, id: current.id };
    db.users[id] = next;
    return next;
  },
};
