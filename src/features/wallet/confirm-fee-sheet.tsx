/**
 * The explicit "yes, charge me" step.
 *
 * # Why a whole sheet, and why RSVP needs one
 *
 * The dApp Store policy asks that fees, amounts, assets, recipients and
 * expected outcomes be clear *before* the user is asked to continue or sign.
 * Event creation satisfies that with the Review step - a screen the user is
 * already reading, where `FeeDisclosure` sits directly above the Publish
 * button.
 *
 * RSVP had no such screen. Tapping "RSVP" quoted the fee and handed straight to
 * the wallet in one motion, so the entire disclosure was the toast that
 * `payFee` raised as the screen dimmed - the one the reviewer could not read.
 * There was no moment between intent and charge at which the amount existed on
 * screen.
 *
 * This is that moment. It is not a nag: it is the only place a one-tap payment
 * flow can state the price before taking it.
 *
 * Dismissing it is a no-op by design - closing, dragging down, or hardware-back
 * all resolve as "not now" and charge nothing, which is what makes it safe to
 * put in front of the wallet hand-off.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Text } from '@/components/ui/text';
import type { FeeKind } from '@/services/solana/fees';

import { FeeDisclosure } from './fee-disclosure';

interface ConfirmFeeSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  kind: FeeKind;
  /** What the user is agreeing to, named as the thing they wanted. */
  title: string;
  /** What happens once the charge confirms. */
  outcome: string;
  /** Label for the affirmative button - the action, not the word "Confirm". */
  confirmLabel: string;
  /** True while the charge is in flight, so the sheet cannot be double-tapped. */
  busy?: boolean;
}

export const ConfirmFeeSheet = memo(function ConfirmFeeSheet({
  visible,
  onClose,
  onConfirm,
  kind,
  title,
  outcome,
  confirmLabel,
  busy = false,
}: ConfirmFeeSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Review the charge before you approve it in your wallet"
      maxHeightRatio={0.7}
    >
      <View className="gap-4 pb-2">
        <FeeDisclosure kind={kind} outcome={outcome} />

        <View className="flex-row gap-3">
          {/*
            "Not now" rather than "Cancel": cancelling is also what the user
            does inside the wallet a second later, and having one word mean two
            different steps is how someone ends up unsure whether they were
            charged.
          */}
          <Button
            label="Not now"
            variant="secondary"
            onPress={onClose}
            disabled={busy}
            className="flex-1"
          />
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            loading={busy}
            className="flex-[1.4]"
            accessibilityHint="Opens your wallet to approve the payment"
          />
        </View>

        <Text variant="caption" className="text-center text-muted-foreground">
          Nothing is charged until you approve it in your wallet.
        </Text>
      </View>
    </BottomSheet>
  );
});
