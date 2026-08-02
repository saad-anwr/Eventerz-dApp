/**
 * Create Event - six-step wizard.
 *
 * The draft lives in `createEventStore`, so this file only owns navigation
 * between steps, validation gating and the publish mutation. Publishing signs
 * a transaction through the wallet adapter before the event appears anywhere.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, useListBottomPadding } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  AccessStep,
  BasicsStep,
  DesignStep,
  LocationStep,
  ReviewStep,
  ScheduleStep,
  StepScroll,
} from '@/features/create/step-components';
import { ConnectWalletPrompt, ConnectWalletSheet, useConnectWallet } from '@/features/wallet';
import { useCreateEvent } from '@/hooks/use-events';
import { FeeCancelled, useFee } from '@/hooks/use-fee';
import { toast } from '@/store/toast-store';
import { CREATE_STEPS, useCreateEventStore } from '@/store/create-event-store';
import { screenPadding } from '@/theme/layout';
import { haptics } from '@/utils/haptics';
import { useThemeColors } from '@/theme/theme-provider';

const STEP_COMPONENTS = [
  BasicsStep,
  ScheduleStep,
  LocationStep,
  DesignStep,
  AccessStep,
  ReviewStep,
] as const;

export default function CreateScreen() {
  const themeColors = useThemeColors();
  const router = useRouter();
  const bottomPadding = useListBottomPadding(16);

  const { isConnected, sheetVisible, openSheet, closeSheet, handleConnected } =
    useConnectWallet();

  const step = useCreateEventStore((s) => s.step);
  const next = useCreateEventStore((s) => s.next);
  const back = useCreateEventStore((s) => s.back);
  const reset = useCreateEventStore((s) => s.reset);
  const toInput = useCreateEventStore((s) => s.toInput);

  const createEvent = useCreateEvent();

  /** $5 in SOL, taken before the event is written. Free on devnet/testnet. */
  const { payFee: payCreateFee, paying: payingFee } = useFee('createEvent');

  const isLast = step === CREATE_STEPS.length - 1;
  const StepComponent = STEP_COMPONENTS[step];

  const handleNext = useCallback(() => {
    if (!isLast) {
      const advanced = next();
      if (advanced) {
        haptics.light();
      } else {
        haptics.warning();
        toast.error('Check this step', 'A field still needs your attention.');
      }
      return;
    }

    // Publish.
    haptics.medium();

    /*
     * The $5 fee is taken before the event is written, and it is
     * non-refundable. Publishing first would give away a free event whenever
     * the payment failed, and an event cannot be un-published once guests can
     * see it.
     */
    void (async () => {
      let feeSignature: string | null = null;
      try {
        feeSignature = await payCreateFee();
      } catch (error) {
        if (error instanceof FeeCancelled) return;
        haptics.error();
        toast.error(
          'Could not take the creation fee',
          error instanceof Error ? error.message : 'Please try again.',
        );
        return;
      }

      const pendingId = toast.pending(
        'Publishing event',
        'Approve the transaction in your wallet',
      );

      createEvent.mutate(toInput(), {
        onSuccess: (event) => {
          toast.dismiss(pendingId);
          haptics.success();
          toast.success('Event published', 'Your event is live and open for RSVPs.');
          reset();
          router.replace(`/event/${event.id}`);
        },
        onError: (error) => {
          toast.dismiss(pendingId);
          haptics.error();
          toast.error(
            'Could not publish',
            feeSignature
              ? // Money moved and no event exists. Telling them to try again
                // invites a second $5 charge for the same event.
                'Your fee was taken but the event was not created. Contact support with your wallet address - do not pay again.'
              : error instanceof Error
                ? error.message
                : 'Please try again.',
          );
        },
      });
    })();
  }, [createEvent, isLast, next, payCreateFee, reset, router, toInput]);

  const handleBack = useCallback(() => {
    haptics.light();
    back();
  }, [back]);

  if (!isConnected) {
    return (
      <Screen tabBarInset padded>
        <View className="flex-1 justify-center">
          <ConnectWalletPrompt
            title="Connect to create"
            description="Publishing an event writes it on-chain, so it needs a wallet to sign with."
            onConnect={openSheet}
          />
        </View>
        <ConnectWalletSheet
          visible={sheetVisible}
          onClose={closeSheet}
          onConnected={handleConnected}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: screenPadding, paddingTop: 8 }}>
          <View className="flex-row items-center justify-between">
            <Text variant="h1" accessibilityRole="header">
              Create
            </Text>
            <PressableFade
              onPress={() => {
                haptics.light();
                reset();
                toast.info('Draft cleared');
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear draft"
              hitSlop={10}
              className="flex-row items-center gap-1.5 px-2 py-2"
            >
              <RotateCcw size={13} color={themeColors.mutedForeground} strokeWidth={2.2} />
              <Text variant="label" className="text-muted-foreground">
                Reset
              </Text>
            </PressableFade>
          </View>

          {/* Stepper */}
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted-foreground">
                Step {step + 1} of {CREATE_STEPS.length}
              </Text>
              <Text variant="label" style={{ color: themeColors.foreground }}>
                {CREATE_STEPS[step].label}
              </Text>
            </View>
            <ProgressBar
              percent={((step + 1) / CREATE_STEPS.length) * 100}
              className="mt-2.5"
              label={`Step ${step + 1} of ${CREATE_STEPS.length}`}
            />
          </View>
        </View>

        {/* Step body */}
        <View className="flex-1" style={{ paddingHorizontal: screenPadding }}>
          <Animated.View
            key={step}
            entering={SlideInRight.duration(260)}
            exiting={SlideOutLeft.duration(180)}
            className="flex-1"
            style={{ paddingTop: 22 }}
          >
            <StepScroll>
              <StepComponent />
            </StepScroll>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="flex-row gap-3 border-t border-white/10 pt-4"
          style={{
            paddingHorizontal: screenPadding,
            paddingBottom: bottomPadding,
          }}
        >
          {step > 0 && (
            <Button
              label="Back"
              icon={ArrowLeft}
              variant="secondary"
              onPress={handleBack}
              className="flex-1"
            />
          )}
          <Button
            label={isLast ? 'Publish event' : 'Continue'}
            iconRight={isLast ? undefined : ArrowRight}
            icon={isLast ? Check : undefined}
            onPress={handleNext}
            loading={createEvent.isPending || payingFee}
            className={step > 0 ? 'flex-[1.4]' : 'flex-1'}
            accessibilityHint={
              isLast
                ? 'Signs a transaction and publishes your event'
                : 'Moves to the next step'
            }
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
