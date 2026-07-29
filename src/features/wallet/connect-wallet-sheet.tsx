/**
 * Connect-wallet sheet — the mobile counterpart to the web app's
 * `components/wallet/wallet-modal.tsx`.
 *
 * Same information hierarchy: the wallet list, then the "we never touch your
 * funds" reassurance footer. The Seeker's built-in wallet is pinned to the top
 * and visually distinguished, because on Solana Mobile hardware it is the
 * fastest path and the whole reason this app exists.
 */

import { memo, useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { SUPPORTED_WALLETS } from '@/services/wallet';
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
      } else {
        haptics.error();
        toast.error('Connection failed', state.error ?? 'Please try again.');
      }
    },
    [connect, onClose, onConnected],
  );

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
      subtitle="Your wallet is your Eventerz identity"
      maxHeightRatio={0.88}
    >
      <View className="gap-2.5 px-5 pt-4">
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

      <Animated.View
        entering={FadeIn.delay(320)}
        className="mt-5 flex-row items-center gap-2 border-t border-white/10 px-5 pt-4"
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
