/**
 * Friends.
 *
 * Screens read through these rather than touching the repository, so caching
 * and invalidation stay in one place - the same rule the event and message
 * hooks follow.
 *
 * Every mutation invalidates `friends.all` rather than a specific list.
 * Accepting a request moves a row from pending to friends, and removing one
 * takes it out of both, so the two lists are never independent - invalidating
 * only the one that was mutated leaves the other showing a person who has just
 * moved.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { friendsRepository } from '@/repositories/supabase/friends';
import { getSupabaseClient } from '@/services/auth/supabase-client';

import { queryKeys } from './query-keys';

const configured = () => getSupabaseClient() !== null;

export function useFriends(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.friends.list(profileId ?? ''),
    queryFn: () => friendsRepository.listFriends(profileId!),
    enabled: Boolean(profileId) && configured(),
    staleTime: 30_000,
  });
}

export function usePendingFriendRequests(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.friends.pending(profileId ?? ''),
    queryFn: () => friendsRepository.listPending(profileId!),
    enabled: Boolean(profileId) && configured(),
    staleTime: 15_000,
  });
}

/** The row linking the viewer to someone else, so a profile can offer Remove. */
export function useFriendship(
  profileId: string | undefined,
  otherId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.friends.relationship(profileId ?? '', otherId ?? ''),
    queryFn: () => friendsRepository.relationship(profileId!, otherId!),
    enabled:
      Boolean(profileId) && Boolean(otherId) && profileId !== otherId && configured(),
    staleTime: 15_000,
  });
}

export function useSendFriendRequest(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addresseeId: string) => {
      if (!profileId) throw new Error('Sign in to add friends.');
      return friendsRepository.send(profileId, addresseeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      friendsRepository.respond(id, accept),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      // Accepting adds someone to the inbox, which is friends union DM partners.
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => friendsRepository.remove(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
    },
  });
}
