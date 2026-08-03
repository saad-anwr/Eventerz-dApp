import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { communityRepository } from '@/repositories';
import { useWalletStore } from '@/store/wallet-store';

import { queryKeys } from './query-keys';

export function useTrendingCommunities(limit = 5) {
  return useQuery({
    queryKey: queryKeys.communities.trending(),
    queryFn: () => communityRepository.listTrending(limit),
    staleTime: 5 * 60_000,
  });
}

export function useCommunity(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.detail(id ?? ''),
    queryFn: () => communityRepository.getById(id!),
    enabled: Boolean(id),
  });
}

export function useMyCommunities() {
  const user = useWalletStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.communities.byMember(user?.id ?? ''),
    queryFn: () => communityRepository.listByMember(user!.id),
    enabled: Boolean(user),
  });
}

export function useToggleCommunityMembership() {
  const queryClient = useQueryClient();
  const user = useWalletStore((s) => s.user);

  return useMutation({
    mutationFn: (communityId: string) => {
      if (!user) throw new Error('Connect a wallet to join a community.');
      return communityRepository.toggleMembership(communityId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.all });
    },
  });
}
