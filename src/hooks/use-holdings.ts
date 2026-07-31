/**
 * Wallet holdings.
 *
 * Keyed by address rather than by profile, because that is what the chain is
 * keyed by - and it means a friend's holdings and your own share one cache
 * entry when they are the same wallet.
 */

import { useQuery } from '@tanstack/react-query';

import { getWalletHoldings } from '@/services/solana/holdings';

import { queryKeys } from './query-keys';

export function useWalletHoldings(address: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.holdings.byAddress(address ?? ''),
    queryFn: () => getWalletHoldings(address!),
    enabled: Boolean(address),
    // Balances move, but not fast enough to justify refetching on every focus.
    staleTime: 60_000,
    retry: 1,
  });
}
