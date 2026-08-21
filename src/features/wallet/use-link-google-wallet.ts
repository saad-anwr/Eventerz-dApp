/**
 * Keeps the Google account and the connected wallet bound together.
 *
 * The account is the account and wallets attach to it, many to one (migration
 * 0022), so whenever both exist we make sure the server knows this wallet is
 * one of that account's. Runs once per (account, wallet) pair - re-linking the
 * same address every render would be a wasted round trip and, worse, a wallet
 * popup.
 *
 * Inert when Supabase is not configured.
 */

import { useEffect, useMemo, useRef } from 'react';

import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';

export function useLinkGoogleWallet(): void {
  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  const linkWallet = useAuthStore((s) => s.linkWallet);
  const wallets = useAuthStore((s) => s.wallets);
  const address = useWalletStore((s) => s.account?.address ?? null);

  /*
   * The membership test used to be `profile.wallet_address === address`. That
   * column holds only the *primary* wallet, so every additional wallet on the
   * account read as unlinked on every render - and this hook responded by
   * asking the user to sign a link challenge for a wallet that was already
   * linked. Testing the set is the whole point of the set existing.
   */
  const linked = useMemo(
    () => new Set(wallets.map((w) => w.address)),
    [wallets],
  );

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
  /**
   * Addresses the user explicitly declined to sign for.
   *
   * Retrying a *transient* failure is the point of clearing `inFlight` below.
   * Retrying a **refusal** is not: this effect runs on any later re-render, so
   * declining the signature once meant the wallet sheet reappeared the next
   * time anything moved - the app asking again, indefinitely, for something the
   * user had just said no to. A decision is remembered until the wallet
   * changes.
   */
  const declined = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLive || !profile || !address) return;
    if (linked.has(address)) return;
    if (inFlight.current === address) return;
    if (declined.current.has(address)) return;

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

      /*
       * `auth-store` clears the error and returns to `idle` for a cancellation,
       * and only that case - so a null error here means the user declined
       * rather than that something broke. The two deserve different words and
       * different colours: one is a fault to report, the other is a choice to
       * acknowledge.
       */
      const error = useAuthStore.getState().error;

      if (!error) {
        declined.current.add(address);
        if (reported.current !== address) {
          reported.current = address;
          toast.info(
            'Wallet not linked',
            'You can link it any time from Settings - your RSVPs will use your Google account until then.',
          );
        }
        return;
      }

      // Once per address. A wallet that cannot be verified is worth saying out
      // loud - the account looks broken otherwise, for a reason nothing shows.
      if (reported.current !== address) {
        reported.current = address;
        toast.error('Could not verify that wallet', error);
      }
    })();
  }, [isLive, profile, address, linkWallet, linked]);
}
