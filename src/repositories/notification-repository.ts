import { db } from '@/mock';
import type { AppNotification } from '@/types';
import { mockDelay } from '@/utils';

export const notificationRepository = {
  async list(): Promise<AppNotification[]> {
    await mockDelay();
    return [...db.notifications].sort((a, b) => b.createdAt - a.createdAt);
  },

  async unreadCount(): Promise<number> {
    await mockDelay(120);
    return db.notifications.filter((n) => !n.read).length;
  },

  async markRead(id: string): Promise<void> {
    await mockDelay(120);
    db.notifications = db.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
  },

  async markAllRead(): Promise<void> {
    await mockDelay(120);
    db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
  },
};
