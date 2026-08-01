/**
 * Whether the connected wallet holds a Seeker Genesis Token.
 *
 * Cached for a long time on purpose. The SGT is soulbound and minted once per
 * device, so the answer changes at most once in a wallet's life - re-asking on
 * every screen focus would be a network call to confirm something that cannot
 * have moved.
 */

import { useQuery } from '@tanstack/react-query';

import { verifySeekerGenesisToken } from '@/services/solana/seeker';

import { queryKeys } from './query-keys';

export function useSeekerStatus(address: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.seeker.byAddress(address ?? ''),
    queryFn: () => verifySeekerGenesisToken(address!),
    enabled: Boolean(address),
    staleTime: 24 * 60 * 60_000,
    // A failed check is reported by the service as `error`, not by throwing, so
    // retrying here would only re-run a call that already handled its failure.
    retry: false,
  });

  return (
    query.data ?? { verified: false, mint: null, error: null }
  );
}
