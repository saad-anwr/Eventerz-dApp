/**
 * Direct-message thread.
 *
 * Open to anyone, deliberately. There is no friendship gate here because there
 * is none in the database either: `can_access_channel` admits either party to a
 * DM channel and always has, so a gate in the UI would refuse to let someone
 * type a message the server would happily accept. It would also make "Contact
 * host" impossible, since a guest with a question is by definition not yet a
 * friend.
 *
 * The composer carries a coin button. That is the crypto-send entry point: the
 * transfer goes wallet-to-wallet and the receipt lands in this thread, so the
 * question "did you get it?" has an answer both people can see.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { PaymentReceiptCard } from '@/components/cards/payment-receipt-card';
import { ErrorState } from '@/components/ui/empty-state';
import { TextInput } from '@/components/ui/text-input';
import { ArrowLeft, Coins, Send } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { SendCryptoSheet } from '@/features/wallet';
import {
  useMessages,
  usePaymentIds,
  usePayments,
  useRealtimeMessages,
  useSendMessage,
} from '@/hooks/use-messages';
import { useUser } from '@/hooks/use-users';
import { dmChannelId } from '@/repositories';
import { transfersEnabled } from '@/services/solana/fees';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { clockTime, dayLabel, shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import type { Message, PaymentReceipt } from '@/types';

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

function Bubble({
  message,
  mine,
  payment,
  grouped,
}: {
  message: Message;
  mine: boolean;
  payment?: PaymentReceipt;
  grouped: boolean;
}) {
  return (
    <View
      className={mine ? 'items-end' : 'items-start'}
      style={{ marginTop: grouped ? 2 : 8, paddingHorizontal: screenPadding }}
    >
      {message.kind === 'payment' ? (
        payment ? (
          <PaymentReceiptCard payment={payment} mine={mine} />
        ) : (
          /*
           * The generated "Sent 0.4 SOL" line, shown while the receipt loads -
           * and permanently for anyone who can read the message but not the
           * payment, which RLS on `payments` allows in an event channel.
           */
          <View
            className="border border-white/10 bg-white/[0.05] px-3.5 py-2"
            style={{ borderRadius: radius['2xl'], maxWidth: '82%' }}
          >
            <Text variant="bodySm">{message.body}</Text>
          </View>
        )
      ) : (
        <View
          className="px-3.5 py-2"
          style={{
            maxWidth: '82%',
            borderRadius: radius['2xl'],
            borderBottomRightRadius: mine ? radius.md : radius['2xl'],
            borderBottomLeftRadius: mine ? radius['2xl'] : radius.md,
            borderWidth: mine ? 0 : 1,
            borderColor: 'rgba(255,255,255,0.10)',
            backgroundColor: mine ? brand.purple : 'rgba(255,255,255,0.05)',
          }}
        >
          <Text variant="body">{message.body}</Text>
        </View>
      )}

      <Text variant="micro" className="mt-0.5 px-1 text-muted-foreground">
        {clockTime(message.createdAt)}
      </Text>
    </View>
  );
}

export default function DirectMessageScreen() {
  const { id: otherId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const meId = useWalletStore((s) => s.user?.id ?? null);
  const { data: other, isLoading } = useUser(otherId);

  const channelId = meId && otherId ? dmChannelId(meId, otherId) : null;

  const { data: messages = [] } = useMessages(channelId);
  const paymentIds = usePaymentIds(messages);
  const { data: payments = [] } = usePayments(channelId, paymentIds);
  const send = useSendMessage(channelId, meId ?? undefined, 'dm');
  useRealtimeMessages(channelId);

  const paymentById = useMemo(
    () => new Map(payments.map((p) => [p.id, p])),
    [payments],
  );

  const [text, setText] = useState('');
  const [sendingCrypto, setSendingCrypto] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const submit = useCallback(() => {
    const body = text.trim();
    if (!body || !channelId) return;
    haptics.selection();
    setText('');
    send.mutate(body);
  }, [channelId, send, text]);

  if (isLoading) return <ScreenLoader />;
  if (!other) {
    return (
      <Screen edgeTop padded>
        <ErrorState
          title="Person not found"
          description="This account may have been removed."
          onRetry={() => router.replace('/(tabs)/community')}
        />
      </Screen>
    );
  }

  const isSelf = meId === otherId;
  const firstName = other.name.split(' ')[0];

  return (
    <Screen edgeTop aurora>
      <View
        className="flex-row items-center gap-3 border-b border-white/10"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
          paddingBottom: 12,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
          size={40}
          iconSize={18}
        />
        <PressableScale
          onPress={() => router.push(`/user/${other.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${other.name}'s profile`}
          className="flex-1 flex-row items-center gap-3"
        >
          <Avatar name={other.name} seed={other.id} size="sm" ring uri={other.avatarUrl} />
          <View className="flex-1">
            <Text variant="title" numberOfLines={1}>
              {other.name}
            </Text>
            <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
              @{other.handle}
              {other.walletAddress
                ? ` · ${shortenAddress(other.walletAddress)}`
                : ''}
            </Text>
          </View>
        </PressableScale>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
            const showDay = !prev || !sameDay(prev.createdAt, item.createdAt);
            const grouped =
              Boolean(prev) &&
              prev.senderId === item.senderId &&
              !showDay &&
              item.createdAt - prev.createdAt < 4 * 60 * 1000;

            return (
              <>
                {showDay && (
                  <View className="items-center py-3">
                    <View
                      className="bg-white/[0.05] px-3 py-1"
                      style={{ borderRadius: radius.full }}
                    >
                      <Text variant="micro" className="text-muted-foreground">
                        {dayLabel(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                )}
                <Bubble
                  message={item}
                  mine={item.senderId === meId}
                  payment={
                    item.paymentId ? paymentById.get(item.paymentId) : undefined
                  }
                  grouped={grouped}
                />
              </>
            );
          }}
          ListEmptyComponent={
            <View className="items-center px-8 py-16">
              <Text variant="bodySm" className="text-center text-muted-foreground">
                This is the start of your conversation with {other.name}.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
          // Newest at the bottom without a manual scroll-to-end on every
          // insert: `inverted` renders the list upside down and the transform
          // flips it back, so the bottom is the natural resting position.
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          keyboardShouldPersistTaps="handled"
        />

        {/* Composer */}
        <View
          className="flex-row items-center gap-2 border-t border-white/10"
          style={{
            paddingHorizontal: screenPadding,
            paddingTop: 10,
            paddingBottom: insets.bottom + 10,
          }}
        >
          {/*
            Hidden rather than disabled while transfers are paused. A greyed-out
            coin button invites people to tap it and learn nothing; a composer
            with no coin button simply does not offer a feature this release
            does not have.
          */}
          {!isSelf && transfersEnabled() && (
            <PressableScale
              onPress={() => setSendingCrypto(true)}
              accessibilityRole="button"
              accessibilityLabel={
                other.walletAddress
                  ? `Send SOL to ${firstName}`
                  : `${firstName} has not linked a wallet`
              }
              className="items-center justify-center border border-white/10 bg-white/[0.05]"
              style={{ width: 40, height: 40, borderRadius: radius.xl }}
            >
              <Coins size={17} color={accents.cyan} />
            </PressableScale>
          )}

          <View
            className="flex-1 flex-row items-center border border-white/10 bg-white/[0.05] px-4"
            style={{ borderRadius: radius.full, minHeight: 40 }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={isSelf ? 'This is you.' : `Message ${firstName}...`}
              placeholderTextColor="rgba(255,255,255,0.40)"
              editable={!isSelf && Boolean(meId)}
              multiline
              onSubmitEditing={submit}
              className="flex-1 text-white"
              style={{ fontSize: 15, maxHeight: 96, paddingVertical: 8 }}
            />
          </View>

          <PressableScale
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            className="items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.xl,
              backgroundColor: brand.purple,
              opacity: text.trim() ? 1 : 0.4,
            }}
          >
            <Send size={17} color="#ffffff" />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      {channelId && (
        <SendCryptoSheet
          visible={sendingCrypto}
          onClose={() => setSendingCrypto(false)}
          channelId={channelId}
          recipient={{
            id: other.id,
            name: other.name,
            walletAddress: other.walletAddress,
          }}
        />
      )}
    </Screen>
  );
}
