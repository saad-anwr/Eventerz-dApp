/**
 * Create Event - six-step wizard.
 *
 * The draft lives in `createEventStore`, so this file only owns navigation
 * between steps, validation gating and the publish mutation.
 *
 * # Publishing is free, and touches no wallet
 *
 * It used to cost $5, taken before the write. That charge is gone (see
 * `services/solana/fees.ts`), and with it the entire pay-then-act apparatus
 * this file was built around: the fee quote, the confirmation sheet, the
 * cancellation branch, and the "your fee was taken but the event was not
 * created" recovery message that existed only because money moved first.
 *
 * What is left is a Postgres write. Nothing here opens the wallet, so nothing
 * here can fail in a way that costs the host anything - a failed publish now
 * means retry, with no second charge to warn about.
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
import { toast } from '@/store/toast-store';
import { CREATE_STEPS, useCreateEventStore } from '@/store/create-event-store';
import { screenPadding } from '@/theme/layout';
import { haptics } from '@/utils/haptics';

const STEP_COMPONENTS = [
  BasicsStep,
  ScheduleStep,
  LocationStep,
  DesignStep,
  AccessStep,
  ReviewStep,
] as const;

export default function CreateScreen() {
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

  const isLast = step === CREATE_STEPS.length - 1;
  const StepComponent = STEP_COMPONENTS[step];

  /**
   * Publish. One database write, no wallet, nothing to undo on failure.
   *
   * "Saving your event", not "Approve the transaction in your wallet" - there
   * is no transaction to approve. That wording was already wrong when the fee
   * existed (the wallet step was over by then); with the fee gone it would be
   * inventing a prompt that never appears.
   */
  const runPublish = useCallback(() => {
    const pendingId = toast.pending(
      'Publishing event',
      'Saving your event and opening RSVPs',
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
          error instanceof Error ? error.message : 'Please try again.',
        );
      },
    });
  }, [createEvent, reset, router, toInput]);

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

    haptics.medium();

    /*
     * Straight to the write. There used to be a confirmation sheet here,
     * because the next thing that happened was a non-refundable $5 charge and
     * store policy asks that a fee be legible before the user is asked to
     * continue. Publishing is free now, so the sheet would be confirming
     * nothing - and a confirmation step that guards no consequence is the kind
     * users learn to tap through.
     */
    runPublish();
  }, [isLast, next, runPublish]);

  const handleBack = useCallback(() => {
    haptics.light();
    back();
  }, [back]);

  if (!isConnected) {
    return (
      <Screen tabBarInset padded>
        <View className="flex-1 justify-center">
          {/*
            The wallet is still required, but not for the reason this used to
            give. "Publishing writes it on-chain, so it needs a wallet to sign
            with" was wrong on both halves: the Anchor program is retired, so
            an event is a Postgres record, and with the creation fee gone there
            is no transaction to sign either.

            What a host's wallet is actually for is being paid - ticket revenue
            settles to it, and it is the identity guests see on the event. That
            is the honest reason, so it is the one stated.
          */}
          <ConnectWalletPrompt
            title="Connect to create"
            description="Your wallet is where ticket revenue lands, and it is the host identity guests see."
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
              <RotateCcw size={13} color="#94a2b8" strokeWidth={2.2} />
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
              <Text variant="label" style={{ color: '#f8fafc' }}>
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
            loading={createEvent.isPending}
            className={step > 0 ? 'flex-[1.4]' : 'flex-1'}
            accessibilityHint={
              isLast
                ? 'Publishes your event and opens RSVPs'
                : 'Moves to the next step'
            }
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
