/**
 * QR check-in scanner.
 *
 * Uses `expo-camera` when permission is granted; the animated reticle and the
 * success sequence are the same either way, so the flow can be exercised on a
 * simulator via the "Simulate a scan" affordance.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import {
  BadgeCheck,
  Camera,
  Check,
  QrCode,
  Settings,
  X,
} from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useEvent } from '@/hooks/use-events';
import { useRedeemTicket } from '@/hooks/use-tickets';
import { toast } from '@/store/toast-store';
import { brand } from '@/theme/colors';
import { makeShadow, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { Ticket } from '@/types';
import { haptics } from '@/utils/haptics';

const FRAME_SIZE = 250;

/** Sweeping laser line inside the reticle. */
function ScanLine() {
  const y = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    y.value = withRepeat(
      withTiming(FRAME_SIZE - 4, {
        duration: 2200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [reduceMotion, y]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: brand.cyan,
          ...makeShadow(brand.cyan, 0.9, 8, 0),
        },
        style,
      ]}
    />
  );
}

/** Corner brackets that pulse while the scanner is armed. */
function Reticle() {
  const pulse = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
  }));

  const corner = 'absolute border-brand-cyan';

  return (
    <Animated.View
      style={[{ width: FRAME_SIZE, height: FRAME_SIZE }, style]}
      className="overflow-hidden"
    >
      <View
        className={`${corner} left-0 top-0`}
        style={{ width: 38, height: 38, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 18 }}
      />
      <View
        className={`${corner} right-0 top-0`}
        style={{ width: 38, height: 38, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 18 }}
      />
      <View
        className={`${corner} bottom-0 left-0`}
        style={{ width: 38, height: 38, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 18 }}
      />
      <View
        className={`${corner} bottom-0 right-0`}
        style={{ width: 38, height: 38, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 18 }}
      />
      <ScanLine />
    </Animated.View>
  );
}

/** Success state - checkmark pops, then the event name fades in. */
function SuccessOverlay({
  ticket,
  onDone,
}: {
  ticket: Ticket;
  onDone: () => void;
}) {
  const { data: event } = useEvent(ticket.eventId);
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.15, { damping: 10, stiffness: 200 }),
      withSpring(1, { damping: 16, stiffness: 180 }),
    );
    haptics.success();
  }, [scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      className="absolute inset-0 items-center justify-center bg-brand-bg/97"
      style={{ paddingHorizontal: screenPadding }}
    >
      <Animated.View
        style={[
          {
            width: 108,
            height: 108,
            borderRadius: 54,
            backgroundColor: `${brand.green}22`,
            borderWidth: 2,
            borderColor: brand.green,
          },
          style,
        ]}
        className="items-center justify-center"
      >
        <Check size={52} color={brand.green} strokeWidth={3} />
      </Animated.View>

      <Animated.View entering={FadeIn.delay(220)} className="mt-7 items-center">
        <Text variant="h2" className="text-center">
          Checked in
        </Text>
        <Text
          variant="body"
          className="mt-2 text-center text-muted-foreground"
        >
          {event?.title ?? 'Event'}
        </Text>
        <Text
          className="mt-1"
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 13,
            color: brand.cyan,
          }}
        >
          #{String(ticket.serial).padStart(4, '0')} · {ticket.tier}
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(380)}
        className="mt-6 flex-row items-center gap-2"
      >
        <BadgeCheck size={15} color={brand.green} strokeWidth={2.2} />
        <Text variant="caption" className="text-muted-foreground">
          Attendance written on-chain · POAP badge dropped
        </Text>
      </Animated.View>

      <Button
        label="Scan another"
        onPress={onDone}
        size="lg"
        className="mt-9"
        style={{ minWidth: 220 }}
      />
    </Animated.View>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<Ticket | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  // Guards against the camera firing the same code dozens of times per second.
  const locked = useRef(false);

  const redeem = useRedeemTicket();

  const handlePayload = useCallback(
    (payload: string) => {
      if (locked.current) return;
      locked.current = true;
      haptics.medium();

      redeem.mutate(payload, {
        onSuccess: (ticket) => setScanned(ticket),
        onError: (error) => {
          haptics.error();
          toast.error(
            'Check-in failed',
            error instanceof Error ? error.message : 'Try scanning again.',
          );
          // Re-arm after the toast so the operator can retry.
          setTimeout(() => {
            locked.current = false;
          }, 1600);
        },
      });
    },
    [redeem],
  );

  const reset = useCallback(() => {
    setScanned(null);
    locked.current = false;
  }, []);

  const granted = permission?.granted ?? false;

  /*
   * Android stops showing the system dialog after the second denial, and
   * `requestPermission()` then resolves immediately having done nothing. Calling
   * it anyway gave a button that was fully enabled, gave haptic feedback, and
   * could never work - the only way out is the OS settings screen, so once
   * `canAskAgain` is false that is what the button has to do.
   *
   * `permission` is null on the very first render, before the hook has read the
   * current status. Treat that as "we can still ask": assuming the opposite
   * would send a first-time user to Settings for a permission nobody has
   * requested yet.
   */
  const canAskAgain = permission?.canAskAgain ?? true;

  const handlePermission = useCallback(() => {
    haptics.light();
    if (canAskAgain) {
      void requestPermission();
      return;
    }
    void Linking.openSettings().catch(() => {
      toast.error(
        'Could not open Settings',
        'Enable the camera for Eventerz in your device settings.',
      );
    });
  }, [canAskAgain, requestPermission]);

  return (
    <View className="flex-1 bg-brand-bg">
      {granted && !scanned ? (
        <CameraView
          style={{ position: 'absolute', inset: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handlePayload(data)}
        />
      ) : null}

      {/* Scrim */}
      <View
        className="absolute inset-0 bg-black/55"
        style={{ pointerEvents: 'none' }}
      />

      {/* Header */}
      <View
        className="flex-row items-center justify-between"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
        }}
      >
        <IconButton
          icon={X}
          label="Close scanner"
          onPress={() => router.back()}
          variant="glass"
          size={40}
          iconSize={18}
        />
        <Text variant="title">Check-in</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Reticle */}
      <View className="flex-1 items-center justify-center">
        <Reticle />

        <Text variant="body" className="mt-8 text-center">
          {granted
            ? 'Point at an Eventerz ticket QR'
            : 'Camera access is needed to check guests in'}
        </Text>
        <Text
          variant="caption"
          className="mt-2 text-center text-muted-foreground"
          style={{ maxWidth: 300 }}
        >
          {granted
            ? 'Each scan writes attendance on-chain and mints the guest a Proof-of-Attendance badge.'
            : canAskAgain
              ? 'We only use the camera while this screen is open.'
              : 'Camera access was turned off for Eventerz. Turn it back on in Settings, then come back to this screen.'}
        </Text>

        {!granted && (
          <Button
            label={canAskAgain ? 'Enable camera' : 'Open Settings'}
            icon={canAskAgain ? Camera : Settings}
            onPress={handlePermission}
            className="mt-7"
            style={{ minWidth: 220 }}
          />
        )}
      </View>

      {/* Footer */}
      <View
        style={{
          paddingHorizontal: screenPadding,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {/*
          Emulators have no camera. Rather than ship a fake-scan button to
          production, offer manual entry - it exercises the same server-side
          redemption path and is genuinely useful at a door when a phone screen
          is too cracked or dim to scan.
        */}
        {!granted && (
          <Button
            label={manualOpen ? 'Hide manual entry' : 'Enter code manually'}
            icon={QrCode}
            variant="secondary"
            onPress={() => setManualOpen((open) => !open)}
            fullWidth
          />
        )}

        {manualOpen && (
          <View className="mt-3 gap-3">
            <TextField
              label="Ticket code"
              placeholder="eventerz:v1:checkin?ticket=...&secret=..."
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Check in"
              onPress={() => handlePayload(manualCode.trim())}
              loading={redeem.isPending}
              disabled={manualCode.trim().length === 0}
              fullWidth
            />
          </View>
        )}

        <Text
          variant="micro"
          className="mt-3 text-center text-muted-foreground"
        >
          Organizers only - scanning redeems the guest&apos;s ticket.
        </Text>
      </View>

      {scanned && (
        <SuccessOverlay
          ticket={scanned}
          onDone={reset}
        />
      )}
    </View>
  );
}

