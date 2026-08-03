/**
 * Send SOL to someone from the thread you are talking to them in.
 *
 * # The order of operations, and why it is this one
 *
 * The transfer happens on-chain **first**, and the receipt is written only after
 * the cluster confirms it. The other ordering - record, then send - is tempting
 * because it gives the UI something to render immediately, and it is wrong: a
 * receipt for a transfer that then fails is a lie the recipient acts on, and
 * there is no way to un-tell someone they were paid.
 *
 * `record_payment` is idempotent on the signature, so the failure mode of this
 * ordering is benign: if the app is killed between confirmation and recording,
 * the money has moved and the receipt is missing, and calling again with the
 * same signature files it exactly once.
 *
 * # Why this needs no deployed program
 *
 * The intent is `{ type: 'transfer' }`, which `MobileWalletAdapter` compiles to
 * a System Program instruction. It is the one intent that does not touch the
 * Eventerz program, so sending crypto works today while RSVP-on-chain does not.
 *
 * # What this does not do
 *
 * SPL tokens. The plumbing beneath is token-agnostic - `payments` stores a mint,
 * decimals and a symbol, and `verify-payment` checks token balances - but a
 * token transfer means resolving or creating an associated token account for the
 * recipient and paying its rent, which is a materially different conversation to
 * have in a chat window.
 */

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { TextField } from '@/components/ui/form';
import { ArrowUpRight, Check, Coins, ShieldCheck } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { integrationsConfig } from '@/constants/config';
import { useRecordPayment } from '@/hooks/use-messages';
import { transfersEnabled } from '@/services/solana/fees';
import { walletService } from '@/services/wallet';
import { explorerTxUrl } from '@/utils/explorer';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import {
  fromBaseUnits,
  lamportsToSol,
  maxSendableLamports,
  solToLamports,
} from '@/utils/amount';
import { shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';

interface Recipient {
  id: string;
  name: string;
  /** Null when they have never linked one - the blocking case. */
  walletAddress?: string;
}

interface SendCryptoSheetProps {
  visible: boolean;
  onClose: () => void;
  recipient: Recipient;
  /** The DM channel the receipt is posted into. */
  channelId: string;
}

type Phase = 'form' | 'sending' | 'recording' | 'done';

const QUICK_AMOUNTS = ['0.01', '0.05', '0.1', '0.5'];

export function SendCryptoSheet({
  visible,
  onClose,
  recipient,
  channelId,
}: SendCryptoSheetProps) {
  const account = useWalletStore((s) => s.account);
  const balanceSol = useWalletStore((s) => s.balanceSol);
  const refreshBalance = useWalletStore((s) => s.refreshBalance);
  const record = useRecordPayment(channelId);

  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');

  /**
   * Reset on close rather than on open.
   *
   * Same visible outcome - a previous success is never still on screen when
   * someone comes back - but it happens in an event handler instead of an
   * effect. Resetting in an effect keyed on `visible` triggers a second render
   * pass every time the sheet opens, which is what `react-hooks/set-state-in-effect`
   * is warning about: the state does not depend on anything external, so there
   * is nothing to synchronise.
   */
  const close = useCallback(() => {
    onClose();
    setAmount('');
    setMemo('');
    setPhase('form');
    setError('');
    setSignature('');
  }, [onClose]);

  /*
   * The balance *is* external state, so reading it on open is what an effect is
   * for. Fire-and-forget: the store owns the value and the form only needs it to
   * show a ceiling.
   */
  useEffect(() => {
    if (visible) void refreshBalance();
  }, [visible, refreshBalance]);

  /*
   * The store keeps the balance as a display float, which is fine for showing
   * and unusable for arithmetic. Round to lamports once, here, rather than doing
   * float maths on an amount.
   */
  const balanceLamports = useMemo(
    () =>
      balanceSol === null
        ? null
        : BigInt(Math.round(balanceSol * 1_000_000_000)),
    [balanceSol],
  );
  const max =
    balanceLamports === null ? null : maxSendableLamports(balanceLamports);

  /** Parse without throwing, so the form can validate as the user types. */
  const parsed = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return solToLamports(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const validationError = (() => {
    if (!amount.trim()) return null;
    if (parsed === null) return 'Enter an amount like 0.25';
    if (parsed <= 0n) return 'Enter an amount greater than zero.';
    if (max !== null && parsed > max) {
      return `That is more than you can send. You have ${lamportsToSol(balanceLamports ?? 0n)} SOL.`;
    }
    return null;
  })();

  const busy = phase === 'sending' || phase === 'recording';
  const canSend =
    transfersEnabled() &&
    Boolean(account) &&
    Boolean(recipient.walletAddress) &&
    parsed !== null &&
    parsed > 0n &&
    !validationError &&
    phase === 'form';

  const send = useCallback(async () => {
    /*
     * The authoritative check, not the button's `disabled` state.
     *
     * This is the only place in the app that hands a signed transfer to a
     * wallet, so the guard belongs here rather than only on whatever opened the
     * sheet. A screen that forgets to hide its button, or a deep link that
     * mounts this directly, must still be unable to move a lamport.
     */
    if (!transfersEnabled()) return;
    if (!recipient.walletAddress || parsed === null) return;
    setError('');
    haptics.selection();

    let sent = '';
    try {
      setPhase('sending');

      /*
       * The wallet submits *and* confirms - MWA's `signAndSendTransactions`
       * returns once the cluster has accepted it. That is why there is no
       * separate confirm step here, unlike the web flow where the adapter only
       * signs.
       */
      const result = await walletService.signAndSendTransaction({
        type: 'transfer',
        to: recipient.walletAddress,
        lamports: parsed,
        memo: memo.trim() || undefined,
      });
      sent = result.signature;
      setSignature(sent);

      setPhase('recording');
      await record.mutateAsync({
        signature: sent,
        toWallet: recipient.walletAddress,
        toProfile: recipient.id,
        amount: parsed,
        memo: memo.trim() || undefined,
        cluster: integrationsConfig.solanaNetwork,
      });

      haptics.success();
      setPhase('done');
      void refreshBalance();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not send that transfer.';

      // Declining in the wallet is a choice, not a fault. Close quietly.
      if (/user rejected|declined|denied|cancell?ed/i.test(message)) {
        setPhase('form');
        return;
      }

      haptics.error();
      setError(
        sent
          ? // The money may have moved. Say so - telling someone a transfer
            // failed when it did not is the worse of the two mistakes.
            `${message} The transaction was submitted - check Explorer before sending again.`
          : message,
      );
      setPhase('form');
    }
  }, [memo, parsed, recipient, record, refreshBalance]);

  const openExplorer = useCallback(async () => {
    try {
      await Linking.openURL(explorerTxUrl(signature));
    } catch {
      await Clipboard.setStringAsync(signature);
      toast.info('Signature copied - no browser on this device.');
    }
  }, [signature]);

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : close}
      title={phase === 'done' ? 'Sent' : 'Send SOL'}
      subtitle={
        recipient.walletAddress
          ? `${recipient.name} · ${shortenAddress(recipient.walletAddress)}`
          : recipient.name
      }
    >
      {/* Blocking states first - an amount field is pointless if the transfer
          cannot happen at all. */}
      {!recipient.walletAddress ? (
        <View
          className="gap-1 p-4"
          style={{
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: 'rgba(251,191,36,0.35)',
            backgroundColor: 'rgba(251,191,36,0.10)',
          }}
        >
          <Text variant="label" style={{ color: '#fcd34d' }}>
            {recipient.name} has not linked a wallet
          </Text>
          <Text variant="caption" className="text-muted-foreground">
            There is nowhere to send to yet. They can link one from their profile.
          </Text>
        </View>
      ) : !account ? (
        <View className="items-center gap-3 py-4">
          <Coins size={26} color={brand.purple} />
          <Text variant="label">Connect a wallet to send</Text>
          <Text variant="caption" className="text-center text-muted-foreground">
            Close this and connect from the Profile tab.
          </Text>
        </View>
      ) : phase === 'done' ? (
        <View className="items-center gap-2 py-2">
          <View
            className="items-center justify-center"
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: `${accents.green}26`,
            }}
          >
            <Check size={24} color={accents.green} />
          </View>
          <Text variant="h3">Sent {amount} SOL</Text>
          <Text variant="caption" className="text-center text-muted-foreground">
            The receipt is in your conversation with{' '}
            {recipient.name.split(' ')[0]}.
          </Text>
          <Button
            label="View on Explorer"
            variant="ghost"
            size="sm"
            iconRight={ArrowUpRight}
            onPress={openExplorer}
          />
          <Button label="Done" variant="secondary" fullWidth onPress={close} />
        </View>
      ) : (
        <View className="gap-4">
          <TextField
            label="Amount (SOL)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.0"
            keyboardType="decimal-pad"
            editable={!busy}
            hint={
              balanceLamports !== null
                ? `Balance ${lamportsToSol(balanceLamports)} SOL`
                : undefined
            }
            error={validationError ?? undefined}
          />

          <View className="flex-row flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <Chip
                key={value}
                label={value}
                selected={amount === value}
                onPress={() => setAmount(value)}
              />
            ))}
            {max !== null && max > 0n && (
              <Chip
                label="Max"
                selected={false}
                onPress={() => setAmount(fromBaseUnits(max, 9))}
              />
            )}
          </View>

          <TextField
            label="Note (optional)"
            value={memo}
            onChangeText={setMemo}
            placeholder="Ticket split for Friday"
            maxLength={200}
            editable={!busy}
          />

          {error !== '' && (
            <Text variant="caption" style={{ color: '#fca5a5' }}>
              {error}
            </Text>
          )}

          <Button
            label={
              phase === 'sending'
                ? 'Approve in your wallet...'
                : phase === 'recording'
                  ? 'Filing the receipt...'
                  : amount
                    ? `Send ${amount} SOL`
                    : 'Send'
            }
            icon={Coins}
            fullWidth
            size="lg"
            loading={busy}
            disabled={!canSend}
            onPress={() => void send()}
          />

          <View className="flex-row items-start gap-2">
            <ShieldCheck size={13} color={accents.green} />
            <Text variant="caption" className="flex-1 text-muted-foreground">
              Eventerz never holds your funds. The transfer goes straight from
              your wallet to theirs, and you approve it there.
            </Text>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}
