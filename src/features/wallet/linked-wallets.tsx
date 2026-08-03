/**
 * The wallets attached to this account.
 *
 * # Why this list exists at all
 *
 * Until migration 0022 an account held exactly one wallet, in a single `text
 * unique` column. Real people do not hold one wallet - a Seeker wallet, a
 * browser wallet, a hardware wallet, a burner - and with a 1:1 column the only
 * way to use the second one was to make a second account. The schema meant to
 * prevent duplicate identities was manufacturing them.
 *
 * So: many wallets, one account, each proven by the same Ed25519 signature
 * 0011 already required. This screen is where that becomes visible - without
 * it the feature exists in the database and nowhere a user can see.
 *
 * # Primary
 *
 * Exactly one wallet is primary. It is the one mirrored into
 * `profiles.wallet_address`, which is what event cards, receipts and the public
 * address -> account lookup all read, so in practice it is the wallet the rest
 * of Eventerz treats as "yours". Changing it is one tap and no signature - the
 * ownership proof happened when the wallet was linked, and re-proving it to
 * reorder a list you already own would be theatre.
 *
 * The other wallets are deliberately *not* published. See the migration header
 * for the argument: linking a burner to a main wallet in public is exactly the
 * connection a burner exists to avoid.
 */

import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Plus, Star, Trash2, Wallet } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';

/** Matches `max_wallets_per_profile()` in migration 0022. */
const MAX_WALLETS = 10;

export const LinkedWallets = memo(function LinkedWallets({
  /** Opens the connect sheet. Owned by the screen, which hosts the sheet. */
  onLink,
}: {
  onLink: () => void;
}) {
  const profile = useAuthStore((s) => s.profile);
  const wallets = useAuthStore((s) => s.wallets);
  const setPrimary = useAuthStore((s) => s.setPrimaryWallet);
  const unlink = useAuthStore((s) => s.unlinkWallet);
  const connected = useWalletStore((s) => s.account?.address ?? null);

  const [busy, setBusy] = useState<string | null>(null);

  const handlePrimary = useCallback(
    async (address: string) => {
      haptics.selection();
      setBusy(address);
      const ok = await setPrimary(address);
      setBusy(null);
      if (ok) toast.success('Main wallet updated');
      else
        toast.error(
          'Could not update',
          useAuthStore.getState().error ?? undefined,
        );
    },
    [setPrimary],
  );

  const handleUnlink = useCallback(
    async (address: string) => {
      haptics.warning();
      setBusy(address);
      const ok = await unlink(address);
      setBusy(null);
      if (ok) toast.success('Wallet removed', 'Your account is unchanged.');
      else
        toast.error(
          'Could not remove',
          useAuthStore.getState().error ?? undefined,
        );
    },
    [unlink],
  );

  // Nothing to manage without an account: wallets attach to one, and a
  // signed-out user has no set for this to be a view of.
  if (!profile) return null;

  return (
    <View className="gap-2.5">
      {wallets.length === 0 ? (
        <View
          className="flex-row items-center gap-3 border border-white/10 bg-white/[0.03] p-4"
          style={{ borderRadius: radius['2xl'] }}
        >
          <Wallet size={18} color="#94a2b8" strokeWidth={2} />
          <Text variant="bodySm" className="flex-1 text-muted-foreground">
            No wallets linked yet. Link one and approve the signature to attach
            it to this account.
          </Text>
        </View>
      ) : (
        wallets.map((wallet) => (
          <View
            key={wallet.address}
            className="border border-white/10 bg-white/[0.035] p-4"
            style={{ borderRadius: radius['2xl'] }}
          >
            <View className="flex-row items-center gap-3">
              <Wallet size={18} color="#94a2b8" strokeWidth={2} />
              <View className="flex-1">
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 12,
                    color: '#f8fafc',
                  }}
                >
                  {shortenAddress(wallet.address, 6)}
                </Text>
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {wallet.isPrimary && (
                    <Badge label="Main" variant="green" size="sm" icon={Check} />
                  )}
                  {/* Naming the wallet in the user's hand removes the only
                      genuinely confusing case: several truncated base58
                      addresses that all look alike. */}
                  {wallet.address === connected && (
                    <Badge label="Connected now" variant="purple" size="sm" />
                  )}
                </View>
              </View>
            </View>

            <View className="mt-3 flex-row gap-2">
              {!wallet.isPrimary && (
                <Button
                  label="Make main"
                  icon={Star}
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  loading={busy === wallet.address}
                  onPress={() => void handlePrimary(wallet.address)}
                  className="flex-1"
                />
              )}
              <Button
                label="Remove"
                icon={Trash2}
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                loading={busy === wallet.address}
                onPress={() => void handleUnlink(wallet.address)}
                className="flex-1"
              />
            </View>
          </View>
        ))
      )}

      {/*
        The way *in*.

        This panel shipped with Remove and "Make main" and no way to add a
        wallet, which made a screen about managing several wallets usable only
        for taking them away. Linking goes through the same connect sheet as
        every other wallet action: choosing a wallet there triggers
        `useLinkGoogleWallet`, which issues the challenge, has the wallet sign
        it and posts it to the `link-wallet` Edge Function. No second linking
        path to keep in step, and no route to a linked row without a signature.
      */}
      <Button
        label={
          wallets.length === 0 ? 'Link a wallet' : 'Link another wallet'
        }
        icon={Plus}
        variant="secondary"
        onPress={onLink}
        disabled={busy !== null || wallets.length >= MAX_WALLETS}
        fullWidth
      />

      <Text variant="caption" className="text-muted-foreground">
        {wallets.length >= MAX_WALLETS
          ? `You have reached the limit of ${MAX_WALLETS} linked wallets. Remove one to link another.`
          : `Up to ${MAX_WALLETS} wallets can share this account. Your tickets, friends and reputation stay on the account, not on any one wallet.`}
      </Text>
    </View>
  );
});
