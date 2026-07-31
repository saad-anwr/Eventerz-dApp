/**
 * In-memory messaging, for the mock backend.
 *
 * Exists for the same reason every other mock repository does: a fresh clone
 * with no `.env` should still be able to open every screen and see something
 * shaped like real data. Messaging without a network cannot have a second
 * participant, so this is a single-user sandbox - messages persist for the
 * session and nobody replies.
 *
 * Payments are the exception. `recordPayment` refuses rather than fabricating a
 * receipt: a fake signature that renders as "you sent 0.4 SOL" is exactly the
 * kind of comfortable lie this codebase avoids elsewhere (see
 * `MobileWalletAdapter.signAndSendTransaction`), and a receipt is the one
 * artefact whose entire value is that it is real.
 */

import { mockUsers } from '@/mock';
import type { Conversation, Message, PaymentReceipt, User } from '@/types';
import { uid } from '@/utils/format';

import { MOCK_LATENCY_MS } from '@/constants/config';

const mockDelay = () =>
  new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

/** Session-scoped. Cleared on reload, which is the honest lifetime for a mock. */
const threads: Record<string, Message[]> = {};

export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('__')}`;
}

export const messageRepository = {
  async listConversations(profileId: string): Promise<Conversation[]> {
    await mockDelay();

    return mockUsers
      .filter((u: User) => u.id !== profileId)
      .slice(0, 8)
      .map((user: User) => {
        const thread = threads[dmChannelId(profileId, user.id)] ?? [];
        return {
          user,
          last: thread[thread.length - 1],
          isFriend: true,
        };
      })
      .sort((a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0));
  },

  async listMessages(channelId: string): Promise<Message[]> {
    await mockDelay();
    return threads[channelId] ?? [];
  },

  async send(
    channelId: string,
    senderId: string,
    body: string,
    scope: 'event' | 'dm' = 'dm',
  ): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) return;

    (threads[channelId] ??= []).push({
      id: uid('m'),
      scope,
      channelId,
      senderId,
      body: trimmed,
      kind: 'text',
      createdAt: Date.now(),
    });
  },

  async listPayments(): Promise<PaymentReceipt[]> {
    return [];
  },

  async recordPayment(): Promise<PaymentReceipt> {
    throw new Error(
      'Sending crypto needs the live backend - set EXPO_PUBLIC_USE_MOCK_DATA=false.',
    );
  },

  async verifyPayment(): Promise<boolean> {
    return false;
  },
};
