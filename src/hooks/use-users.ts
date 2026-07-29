import { useQuery } from '@tanstack/react-query';

import { userRepository } from '@/repositories';

import { queryKeys } from './query-keys';

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? ''),
    queryFn: () => userRepository.getById(id!),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

/** Batch lookup for attendee rows — one query fills an entire avatar stack. */
export function useUsers(ids: string[]) {
  return useQuery({
    queryKey: queryKeys.users.many(ids),
    queryFn: () => userRepository.getMany(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.users.search(query),
    queryFn: () => userRepository.search(query),
    staleTime: 60_000,
  });
}
