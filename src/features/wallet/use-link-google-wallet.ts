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
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';

export function useLinkGoogleWallet(): void {
  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  const linkWallet = useAuthStore((s) => s.linkWallet);
  const address = useWalletStore((s) => s.account?.address ?? null);

  /**
   * The address currently being linked, not the last one attempted.
   *
   * It used to be set *before* awaiting `linkWallet`, and the result was
   * discarded with `void`. So a failed link - the Edge Function not deployed,
   * the user declining the signature, no network - was recorded as done and
   * never retried, silently. That is how a wallet stays unlinked while the app
   * shows a provisional identity: the RSVP lands under the Google profile, the
   * screen keeps showing `wallet:<address>`, and Attending reads empty.
   *
   * Now it is cleared on failure, so the next render with the same pair tries
   * again, and the error the store recorded is surfaced once.
   */
  const inFlight = useRef<string | null>(null);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!isLive || !profile || !address) return;
    if (profile.wallet_address === address) return;
    if (inFlight.current === address) return;

    inFlight.current = address;

    void (async () => {
      const ok = await linkWallet(address);

      if (ok) {
        // Now a real profile owns this wallet, so the identity the rest of the
        // app reads has to be re-resolved - otherwise every screen keeps the
        // provisional one until the next cold start.
        await useWalletStore.getState().refreshUser();
        return;
      }

      inFlight.current = null;

      // Once per address. A wallet that cannot be verified is worth saying out
      // loud - the account looks broken otherwise, for a reason nothing shows.
      if (reported.current !== address) {
        reported.current = address;
        const error = useAuthStore.getState().error;
        toast.error(
          'Could not verify that wallet',
          error ?? 'Your wallet is connected but not linked to your account yet.',
        );
      }
    })();
  }, [isLive, profile, address, linkWallet]);
}
