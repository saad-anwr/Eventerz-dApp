/**
 * Friend action button.
 *
 * Mirrors the website's `components/app/friend-button.tsx`, including its state
 * model, so the same pair of people see the same thing on either platform.
 *
 * Five states, not two. "Add friend" / "Remove friend" cannot express a request
 * that has been sent and not answered, and it certainly cannot express one
 * waiting on *you* - both of which are the interesting cases:
 *
 *   self      the viewer's own profile; the button does not exist
 *   none      no row between them
 *   outgoing  the viewer asked and is waiting
 *   incoming  the other person asked, and this is where you answer
 *   friends   accepted, so the useful action is now Message
 *
 * A declined row counts as `none` on purpose. Declining is not a block, and
 * leaving the pair permanently unable to ask again would make a single tap
 * irreversible.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Check, MessageCircle, UserPlus } from '@/components/ui/icon';
import {
  useFriendship,
  useRemoveFriend,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from '@/hooks/use-friends';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { haptics } from '@/utils/haptics';

type Relation = 'self' | 'none' | 'friends' | 'outgoing' | 'incoming';

export function FriendButton({
  userId,
  name,
}: {
  /** The OTHER user. */
  userId: string;
  /** Used in toasts, so they name a person rather than an id. */
  name?: string;
}) {
  const router = useRouter();
  const me = useWalletStore((s) => s.user?.id ?? null);

  const { data: request, isLoading } = useFriendship(me ?? undefined, userId);
  const send = useSendFriendRequest(me ?? undefined);
  const respond = useRespondToFriendRequest();
  const remove = useRemoveFriend();

  const relation = useMemo<Relation>(() => {
    if (!me || me === userId) return 'self';
    if (!request || request.status === 'declined') return 'none';
    if (request.status === 'accepted') return 'friends';
    return request.requester_id === me ? 'outgoing' : 'incoming';
  }, [me, userId, request]);

  if (relation === 'self') return null;

  const busy = send.isPending || respond.isPending || remove.isPending;
  const who = name ?? 'them';

  if (isLoading) {
    // Hold the slot while the relationship resolves, so the header does not
    // reflow under the user's thumb the moment the query lands.
    return <Button label="" variant="secondary" size="sm" loading disabled />;
  }

  if (relation === 'friends') {
    return (
      <Button
        label="Message"
        icon={MessageCircle}
        variant="secondary"
        size="sm"
        onPress={() => router.push(`/messages/${userId}`)}
      />
    );
  }

  if (relation === 'outgoing') {
    return (
      <Button
        label="Requested"
        icon={Check}
        variant="ghost"
        size="sm"
        disabled={busy}
        onPress={() => {
          if (!request) return;
          haptics.selection();
          remove.mutate(request.id, {
            onSuccess: () => toast.success('Request withdrawn'),
            onError: (e) =>
              toast.error(
                'Could not withdraw',
                e instanceof Error ? e.message : undefined,
              ),
          });
        }}
      />
    );
  }

  if (relation === 'incoming') {
    return (
      <View className="flex-row items-center gap-2">
        <Button
          label="Decline"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => {
            if (!request) return;
            haptics.selection();
            respond.mutate({ id: request.id, accept: false });
          }}
        />
        <Button
          label="Accept"
          size="sm"
          disabled={busy}
          onPress={() => {
            if (!request) return;
            haptics.success();
            respond.mutate(
              { id: request.id, accept: true },
              { onSuccess: () => toast.success(`You and ${who} are friends`) },
            );
          }}
        />
      </View>
    );
  }

  return (
    <Button
      label="Add friend"
      icon={UserPlus}
      variant="secondary"
      size="sm"
      disabled={busy}
      onPress={() => {
        haptics.selection();
        send.mutate(userId, {
          onSuccess: () => toast.success('Request sent'),
          onError: (e) =>
            toast.error(
              'Could not send request',
              e instanceof Error ? e.message : undefined,
            ),
        });
      }}
    />
  );
}
