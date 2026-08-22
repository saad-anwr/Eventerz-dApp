/**
 * Connect-wallet sheet - the mobile counterpart to the web app's
 * `components/wallet/wallet-modal.tsx`.
 *
 * Same information hierarchy: the wallet list, then the "we never touch your
 * funds" reassurance footer. The Seeker's built-in wallet is pinned to the top
 * and visually distinguished, because on Solana Mobile hardware it is the
 * fastest path and the whole reason this app exists.
 */

import { memo, useCallback, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { SUPPORTED_WALLETS } from '@/services/wallet';
import { useAuthStore } from '@/store/auth-store';
import { useWalletStore } from '@/store/wallet-store';
import { toast } from '@/store/toast-store';
import { brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { WalletDescriptor, WalletId } from '@/types';
import { haptics } from '@/utils/haptics';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import {
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  Wallet as WalletIcon,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';

import { GoogleSignInBlock, useGoogleSignIn } from './google-sign-in';

const WalletRow = memo(function WalletRow({
  wallet,
  pending,
  disabled,
  onSelect,
  index,
}: {
  wallet: WalletDescriptor;
  pending: boolean;
  disabled: boolean;
  onSelect: (id: WalletId) => void;
  index: number;
}) {
  const handlePress = useCallback(
    () => onSelect(wallet.id),
    [onSelect, wallet.id],
  );

  return (
    <Animated.View entering={FadeInDown.delay(index * 55).duration(320)}>
      <PressableScale
        onPress={handlePress}
        disabled={disabled}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Connect ${wallet.name}`}
        accessibilityHint={wallet.tagline}
        accessibilityState={{ disabled, busy: pending }}
        className={
          wallet.native
            ? 'flex-row items-center gap-3 border border-brand-green/30 bg-brand-green/[0.07] p-3.5'
            : 'flex-row items-center gap-3 border border-white/10 bg-white/[0.03] p-3.5'
        }
        style={{ borderRadius: radius['2xl'] }}
      >
        <View
          className="items-center justify-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.lg,
            backgroundColor: `${wallet.color}22`,
          }}
        >
          {wallet.native ? (
            <Smartphone size={20} color={wallet.color} strokeWidth={2} />
          ) : (
            <WalletIcon size={20} color={wallet.color} strokeWidth={2} />
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="title">{wallet.name}</Text>
            {wallet.native && (
              <View className="rounded-full bg-brand-green/15 px-2 py-0.5">
                <Text
                  style={{
                    fontFamily: fontFamily.semibold,
                    fontSize: 9,
                    color: brand.green,
                    letterSpacing: 0.4,
                  }}
                >
                  RECOMMENDED
                </Text>
              </View>
            )}
          </View>
          <Text variant="caption" className="mt-0.5 text-muted-foreground">
            {wallet.tagline}
          </Text>
        </View>

        {pending ? (
          <Spinner size={18} />
        ) : (
          <ChevronRight size={16} color="#94a2b8" strokeWidth={2.2} />
        )}
      </PressableScale>
    </Animated.View>
  );
});

export const ConnectWalletSheet = memo(function ConnectWalletSheet({
  visible,
  onClose,
  onConnected,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fired after a successful connection, before the sheet closes. */
  onConnected?: () => void;
}) {
  const connect = useWalletStore((s) => s.connect);
  const status = useWalletStore((s) => s.status);
  const [pendingId, setPendingId] = useState<WalletId | null>(null);

  const isLive = useAuthStore((s) => s.isLive);
  const googleLinking = useAuthStore((s) => s.status === 'linking');

  const handleSelect = useCallback(
    async (walletId: WalletId) => {
      setPendingId(walletId);
      haptics.medium();

      await connect(walletId);
      const state = useWalletStore.getState();

      setPendingId(null);

      if (state.status === 'connected') {
        haptics.success();
        toast.success(
          'Wallet connected',
          `${state.account?.label ?? 'Wallet'} · ${state.account?.cluster}`,
        );
        onConnected?.();
        onClose();
        return;
      }

      /*
       * A cancelled connection leaves `error` null (see `wallet-store`), and
       * gets no toast at all - the user dismissed the wallet on purpose, and
       * telling them it "failed" reads as a bug in the app. The sheet stays
       * open so they can pick a different wallet or use Google.
       */
      if (!state.error) return;

      haptics.error();
      toast.error('Connection failed', state.error);
    },
    [connect, onClose, onConnected],
  );

  const afterGoogle = useCallback(() => {
    onConnected?.();
    onClose();
  }, [onClose, onConnected]);
  const handleGoogle = useGoogleSignIn(afterGoogle);

  const openDownload = useCallback((wallet: WalletDescriptor) => {
    Linking.openURL(wallet.downloadUrl).catch(() => {
      toast.error('Could not open link', 'No browser is available.');
    });
  }, []);

  const busy = status === 'connecting' || pendingId !== null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Connect a wallet"
      /*
       * Not "your wallet is your Eventerz identity" any more. Migration 0022
       * made the Google account the root and wallets attach to it, so the old
       * line was both untrue and discouraging: it told anyone without a wallet
       * - including a store reviewer on a device that has none - that there was
       * no way in, while Google sits right below.
       */
      subtitle="Or continue with Google - no wallet needed to look around"
      maxHeightRatio={0.88}
    >
      {/*
        Scrollable: five wallets plus the Google row and footer exceed the
        sheet on shorter screens, and an unscrollable column simply overflows -
        which looks like the sheet is broken rather than full.
      */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}
      >
        {/*
          Said once, above the list, because the list cannot say it.

          Mobile Wallet Adapter does not let an app choose a wallet: every row
          fires the same association intent and Android decides which app
          answers - usually by asking, or by opening the only one installed. So
          five rows quietly promise a choice that is not ours to make. They earn
          their place by showing what Eventerz works with; this line keeps them
          from also implying something false.
        */}
        <Text variant="caption" className="mb-2.5 text-muted-foreground">
          Any of these work. Your phone will ask which one to open.
        </Text>

        <View className="gap-2.5">
          {SUPPORTED_WALLETS.map((wallet, index) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              index={index}
              pending={pendingId === wallet.id}
              disabled={busy && pendingId !== wallet.id}
              onSelect={handleSelect}
            />
          ))}
        </View>

        {/*
          Google belongs here too, not only on the signed-out screen prompt.
          Home's "Connect" button opens this sheet directly, so without it there
          is no route to sign-in from the main screen.
        */}
        {isLive && (
          <>
            <GoogleSignInBlock
              onPress={handleGoogle}
              busy={googleLinking}
              disabled={googleLinking || busy}
              hint="Signs in for profile discovery and account recovery"
              footnote="Google makes your profile discoverable and the account recoverable. Tickets and check-in still need a wallet."
            />
          </>
        )}
      </ScrollView>

      <Animated.View
        entering={FadeIn.delay(320)}
        className="mt-4 flex-row items-center gap-2 border-t border-white/10 px-5 pt-4"
      >
        <ShieldCheck size={14} color={brand.green} strokeWidth={2.2} />
        <Text variant="caption" className="flex-1 text-muted-foreground">
          Eventerz never has access to your funds. You approve every action.
        </Text>
      </Animated.View>

      <PressableScale
        onPress={() => openDownload(SUPPORTED_WALLETS[1])}
        hapticFeedback={false}
        accessibilityRole="link"
        accessibilityLabel="Get a Solana wallet"
        className="mt-2 flex-row items-center justify-center gap-1 px-5 py-3"
      >
        <Text variant="caption" style={{ color: brand.cyan }}>
          Don&apos;t have a wallet? Get one
        </Text>
        <ArrowUpRight size={12} color={brand.cyan} strokeWidth={2.4} />
      </PressableScale>
    </BottomSheet>
  );
});
