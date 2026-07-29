import { useQuery } from '@tanstack/react-query';

import { analyticsRepository } from '@/repositories';
import { useWalletStore } from '@/store/wallet-store';

import { queryKeys } from './query-keys';

export function useOrganizerStats() {
  const user = useWalletStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.analytics.organizerStats(user?.id ?? ''),
    queryFn: () => analyticsRepository.getOrganizerStats(user!.id),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}

export function useMintsSeries() {
  return useQuery({
    queryKey: queryKeys.analytics.mints(),
    queryFn: () => analyticsRepository.getMintsSeries(),
    staleTime: 5 * 60_000,
  });
}

export function useAttendanceSeries() {
  return useQuery({
    queryKey: queryKeys.analytics.attendance(),
    queryFn: () => analyticsRepository.getAttendanceSeries(),
    staleTime: 5 * 60_000,
  });
}

export function useRecentRegistrations(limit = 6) {
  return useQuery({
    queryKey: queryKeys.analytics.registrations(),
    queryFn: () => analyticsRepository.listRecentRegistrations(limit),
    staleTime: 60_000,
  });
}
