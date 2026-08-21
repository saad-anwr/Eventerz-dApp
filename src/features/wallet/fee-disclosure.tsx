/**
 * What you are about to be charged, stated before you are asked to sign.
 *
 * # Why this component exists
 *
 * The dApp Store rejected the app for the absence of it. The fee was disclosed
 * in exactly one place - a toast raised by `payFee` on the same tick that hands
 * control to the wallet - and that toast was unreadable by construction:
 * Android dims the screen and animates the wallet app over the top, so the only
 * statement of the amount lived a few hundred milliseconds behind a scrim while
 * the user was looking elsewhere. The report read *"fees banner bounces and
 * moves and instantly darkens so user cannot read clearly"*, and separately
 * *"Transaction then simulates to state SOL deduction without clarity on what
 * for."*
 *
 * So this is deliberately the dullest thing on the screen: no entrance
 * animation, no auto-dismiss, no motion of any kind. It renders inline on the
 * screen the user is already reading and stays there until they leave it.
 *
 * # What it must name
 *
 * The policy asks for fees, amounts, assets, recipients and expected outcomes
 * before continuing. All five are here: the dollar price and its SOL
 * equivalent, that the asset is SOL, who receives it, what taking it causes to
 * happen, and - because it is the part nobody can undo - that it is
 * non-refundable.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { CircleAlert, Info, Wallet } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useFeeQuote } from '@/hooks/use-fee';
import { formatFeeSol, type FeeKind } from '@/services/solana/fees';
import { brand, status } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { shortenAddress } from '@/utils/format';

interface FeeDisclosureProps {
  kind: FeeKind;
  /** What the user gets for the money, in their words not ours. */
  outcome: string;
}

export const FeeDisclosure = memo(function FeeDisclosure({
  kind,
  outcome,
}: FeeDisclosureProps) {
  const { quote, failed, usd, label, treasury, charged } = useFeeQuote(kind);

  /*
   * Nothing is charged on devnet/testnet, so claiming a fee there would be a
   * lie in the other direction. Says so plainly rather than rendering nothing,
   * because "no fee row" and "fee row that failed to load" look identical.
   */
  if (!charged) {
    return (
      <View
        className="flex-row items-start gap-2.5 border border-white/10 bg-white/[0.03] p-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <Info size={16} color="#94a2b8" strokeWidth={2.2} />
        <Text variant="bodySm" className="flex-1 text-muted-foreground">
          No fee on this network - test SOL has no value. {outcome}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="border border-brand-cyan/25 bg-brand-cyan/[0.06] p-4"
      style={{ borderRadius: radius['2xl'] }}
      accessible
      accessibilityLabel={
        `${label}: $${usd}` +
        (quote ? `, about ${formatFeeSol(quote.lamports)}` : '') +
        `, paid in SOL to the Eventerz treasury. ${outcome} This fee is non-refundable.`
      }
    >
      <View className="flex-row items-center gap-2.5">
        <Wallet size={16} color={brand.cyan} strokeWidth={2.2} />
        <Text variant="title" className="flex-1">
          {label}
        </Text>
      </View>

      {/* Amount. The dollar figure is the price; SOL is what actually moves. */}
      <View className="mt-3 flex-row items-baseline justify-between">
        <Text variant="bodySm" className="text-muted-foreground">
          You pay
        </Text>
        <Text variant="title" style={{ color: '#f8fafc' }}>
          ${usd}
          {quote ? ` · ${formatFeeSol(quote.lamports)}` : ''}
        </Text>
      </View>

      {failed && (
        /*
         * The rate lookup failed. The dollar price above is still exact, and
         * `payFee` re-quotes and refuses outright if it still cannot price the
         * charge - so this warns without implying the amount shown is wrong.
         */
        <Text variant="bodySm" className="mt-1.5 text-muted-foreground">
          The live SOL rate could not be checked just now. You will see the
          exact SOL amount in your wallet before approving.
        </Text>
      )}

      <View className="mt-2.5 h-px bg-white/[0.08]" />

      <View className="mt-2.5 flex-row items-baseline justify-between">
        <Text variant="bodySm" className="text-muted-foreground">
          Paid to
        </Text>
        <Text variant="bodySm" style={{ color: '#f8fafc' }}>
          Eventerz · {shortenAddress(treasury)}
        </Text>
      </View>

      <View className="mt-2.5 flex-row items-baseline justify-between">
        <Text variant="bodySm" className="text-muted-foreground">
          Asset
        </Text>
        <Text variant="bodySm" style={{ color: '#f8fafc' }}>
          SOL
        </Text>
      </View>

      <View className="mt-3 h-px bg-white/[0.08]" />

      <Text variant="bodySm" className="mt-3 text-muted-foreground">
        {outcome} You approve the transfer in your wallet - Eventerz never signs
        on your behalf, and you can cancel there at no cost.
      </Text>

      {/*
        The one fact with no undo. Given its own row and the warning colour
        because it is the thing a charged user will be angriest to discover
        after the fact rather than before it.
      */}
      <View className="mt-3 flex-row items-start gap-2">
        <CircleAlert size={14} color={status.warning} strokeWidth={2.4} />
        <Text variant="bodySm" className="flex-1" style={{ color: status.warning }}>
          This fee is non-refundable and cannot be reversed once approved.
        </Text>
      </View>
    </View>
  );
});
