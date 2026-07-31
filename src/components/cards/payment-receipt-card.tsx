/**
 * A transfer, rendered in the thread it was sent from.
 *
 * The verified tick is the whole point of the design. `record_payment` writes
 * receipts with `verified = false` because Postgres cannot make an outbound RPC
 * call and therefore cannot know whether the transaction the client described
 * actually happened; the `verify-payment` Edge Function checks the recipient's
 * balance delta against the cluster and flips it.
 *
 * So an unverified receipt must not look like a verified one. It renders with a
 * clock instead of a tick and says "confirming" - true whether it is thirty
 * seconds old or a fabrication, and either way Explorer is one tap away.
 * Rendering every receipt identically would make the tick decorative, and a
 * decorative trust signal is worse than none.
 */

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import { View } from 'react-native';

import { ArrowUpRight, BadgeCheck, Clock, Coins } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { toast } from '@/store/toast-store';
import { accents } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { formatTokenAmount } from '@/utils/amount';
import type { PaymentReceipt } from '@/types';

interface PaymentReceiptCardProps {
  payment: PaymentReceipt;
  /** True when the viewer is the sender - flips the wording, not the amount. */
  mine: boolean;
}

function explorerUrl(signature: string, cluster: string): string {
  const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

export function PaymentReceiptCard({ payment, mine }: PaymentReceiptCardProps) {
  const tint = mine ? accents.green : accents.cyan;
  const pretty = formatTokenAmount(payment.amount, payment.decimals, payment.symbol);

  const open = useCallback(async () => {
    const url = explorerUrl(payment.signature, payment.cluster);
    try {
      await Linking.openURL(url);
    } catch {
      // No browser on the device is a real state, not a bug. The signature is
      // the useful artefact either way.
      await Clipboard.setStringAsync(payment.signature);
      toast.info('Signature copied - no browser on this device.');
    }
  }, [payment.cluster, payment.signature]);

  return (
    <PressableScale
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${mine ? 'You sent' : 'You received'} ${pretty}. Open on Explorer.`}
      className="gap-2 p-3"
      style={{
        maxWidth: '82%',
        borderRadius: radius['2xl'],
        borderWidth: 1,
        borderColor: `${tint}55`,
        backgroundColor: `${tint}16`,
      }}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.lg,
            backgroundColor: `${tint}26`,
          }}
        >
          <Coins size={14} color={tint} />
        </View>
        <View className="flex-1">
          <Text variant="micro" className="uppercase tracking-wider text-muted">
            {mine ? 'You sent' : 'You received'}
          </Text>
          <Text variant="title">{pretty}</Text>
        </View>
        <ArrowUpRight size={14} color="rgba(255,255,255,0.45)" />
      </View>

      {payment.memo && (
        <Text
          variant="bodySm"
          className="border-t border-white/10 pt-2 text-white/85"
        >
          {payment.memo}
        </Text>
      )}

      <View className="flex-row items-center gap-1">
        {payment.verified ? (
          <>
            <BadgeCheck size={11} color={accents.green} />
            <Text variant="micro" className="text-muted">
              Verified on-chain
            </Text>
          </>
        ) : (
          <>
            <Clock size={11} color="rgba(255,255,255,0.45)" />
            <Text variant="micro" className="text-muted">
              Confirming - tap to check on Explorer
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}
