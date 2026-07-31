/**
 * Keeps the Google account and the connected wallet bound together.
 *
 * The wallet is the primary identity, so whenever both exist we make sure the
 * server knows they belong to the same person. Runs once per (account, wallet)
 * pair - re-linking the same address every render would be a wasted round trip.
 *
 * Inert when Supabase is not configured.
 */

import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/store/auth-store';
import { useWalletStore } from '@/store/wallet-store';

export function useLinkGoogleWallet(): void {
  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  const linkWallet = useAuthStore((s) => s.linkWallet);
  const address = useWalletStore((s) => s.account?.address ?? null);

  const lastLinked = useRef<string | null>(null);

  useEffect(() => {
    if (!isLive || !profile || !address) return;
    if (profile.wallet_address === address) return;
    if (lastLinked.current === address) return;

    lastLinked.current = address;
    void linkWallet(address);
  }, [isLive, profile, address, linkWallet]);
}
