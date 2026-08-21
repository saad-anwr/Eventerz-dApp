/**
 * The host's on-chain claim, on the event page.
 *
 * Two jobs, and the second is the one that makes the create flow honest. When
 * publishing, a host can dismiss the wallet prompt - the event goes live
 * anyway, and the toast tells them they can sign later. This is "later". Without
 * it that toast is a promise the app does not keep, and an event would be
 * permanently unclaimable because of one mis-tap.
 *
 * Host-only. There is nothing here a guest can act on, and a guest seeing
 * "unclaimed" would read it as a warning about the event rather than a task
 * belonging to someone else.
 */

import { memo, useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Check, Lock } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { claimEvent } from '@/services/event-claim-service';
import { toast } from '@/store/toast-store';
import { radius } from '@/theme/layout';
import type { EventItem } from '@/types';
import { explorerTxUrl } from '@/utils/explorer';
import { haptics } from '@/utils/haptics';

export const EventClaimSection = memo(function EventClaimSection({
  event,
  onClaimed,
}: {
  event: EventItem;
  /** Refetch, so the signed state replaces the button without a reload. */
  onClaimed: () => void;
}) {
  const [signing, setSigning] = useState(false);

  const sign = useCallback(() => {
    void (async () => {
      setSigning(true);
      haptics.medium();

      // Never throws - every outcome is a result. See `claimEvent`.
      const result = await claimEvent(event.id);
      setSigning(false);

      if (result.ok) {
        haptics.success();
        toast.success(
          'Claim signed',
          'Your record of authorship is on Solana.',
        );
        onClaimed();
        return;
      }

      if (result.failure === 'cancelled') {
        // Dismissing is a decision, not a fault, and the event is unaffected.
        toast.info('Not signed', 'Nothing changed, and you were not charged.');
        return;
      }

      if (result.failure === 'not-linked') {
        // Refused before the wallet opened, so nothing was signed and no
        // network fee was spent. Says what to do rather than what went wrong.
        toast.info('Link this wallet first', result.message ?? '');
        return;
      }

      haptics.error();
      toast.error(
        'Could not sign the claim',
        result.message ?? 'Please try again.',
      );
    })();
  }, [event.id, onClaimed]);

  // Captured, so the callback below does not need a non-null assertion to see
  // what the guard already proved.
  const signature = event.onchainSignature;

  if (signature) {
    return (
      <View
        className="mt-7 flex-row items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-3.5"
        style={{ borderRadius: radius['2xl'] }}
      >
        <Check size={16} color="#4ade80" strokeWidth={2.4} />
        <View className="flex-1">
          <Text variant="bodySm">Claim signed on Solana</Text>
          <PressableFade
            onPress={() => {
              void Linking.openURL(explorerTxUrl(signature));
            }}
            accessibilityRole="link"
            accessibilityLabel="View the claim on Solana Explorer"
            hitSlop={8}
          >
            <Text variant="caption" className="mt-0.5 text-brand-cyan">
              View on Solana Explorer
            </Text>
          </PressableFade>
        </View>
      </View>
    );
  }

  return (
    <View
      className="mt-7 border border-white/10 bg-white/[0.03] px-4 py-3.5"
      style={{ borderRadius: radius['2xl'] }}
    >
      <View className="flex-row items-center gap-2">
        <Lock size={14} color="#94a2b8" strokeWidth={2.2} />
        <Text variant="bodySm">No on-chain claim yet</Text>
      </View>
      {/*
        States the cost before the button, for the same reason the review step
        does: a wallet prompt that opens without warning is read as a charge.
        There is no platform fee here at all - only Solana's own network fee.
      */}
      <Text variant="caption" className="mt-1 text-muted-foreground">
        Sign a short message recording that you published this event. No fee -
        only the Solana network fee, a fraction of a cent.
      </Text>
      <Button
        label="Sign the on-chain claim"
        variant="secondary"
        onPress={sign}
        loading={signing}
        className="mt-3"
      />
    </View>
  );
});
