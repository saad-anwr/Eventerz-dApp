/**
 * Inbox.
 *
 * The list is friends **union** everyone who has actually messaged you. Friends
 * alone was the website's old rule and it meant a host contacted through
 * "Contact host" - by definition not yet a friend - had the message delivered to
 * a thread that appeared nowhere. Friends with no messages are still listed: an
 * empty thread with someone you know is a starting point, not clutter.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Coins, MessageCircle } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useConversations } from '@/hooks/use-messages';
import { useRefresh } from '@/hooks/use-refresh';
import { queryKeys } from '@/hooks/query-keys';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { timeAgo } from '@/utils/format';
import type { Conversation } from '@/types';

function ConversationRow({
  conversation,
  meId,
  onPress,
}: {
  conversation: Conversation;
  meId: string | null;
  onPress: () => void;
}) {
  const { user, last, isFriend } = conversation;
  const mine = last?.senderId === meId;

  return (
    <PressableFade
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${user.name}`}
      className="flex-row items-center gap-3 py-3"
      style={{ paddingHorizontal: screenPadding }}
    >
      <Avatar name={user.name} seed={user.id} size="md" ring />

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="title" numberOfLines={1} className="flex-shrink">
            {user.name}
          </Text>
          {/* An unexplained stranger in an inbox reads as spam. This says where
              they came from. */}
          {!isFriend && (
            <View
              className="border border-white/10 bg-white/[0.05] px-1.5"
              style={{ borderRadius: radius.full, paddingVertical: 1 }}
            >
              <Text variant="micro" className="text-muted-foreground">
                Not a friend
              </Text>
            </View>
          )}
          {last && (
            <Text variant="micro" className="ml-auto text-muted-foreground">
              {timeAgo(last.createdAt)}
            </Text>
          )}
        </View>

        {last ? (
          <View className="flex-row items-center gap-1">
            {last.kind === 'payment' && (
              <Coins size={11} color={accents.green} />
            )}
            <Text
              variant="bodySm"
              numberOfLines={1}
              className="flex-1 text-muted-foreground"
              style={last.kind === 'payment' ? { color: accents.green } : undefined}
            >
              {mine ? 'You: ' : ''}
              {last.body}
            </Text>
          </View>
        ) : (
          <Text variant="bodySm" className="text-muted-foreground">
            Say hi 👋
          </Text>
        )}
      </View>
    </PressableFade>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const meId = useWalletStore((s) => s.user?.id ?? null);

  const { data: conversations = [], isLoading } = useConversations(
    meId ?? undefined,
  );
  const { refreshing, onRefresh } = useRefresh([queryKeys.messages.all]);

  const insets = useSafeAreaInsets();

  const open = useCallback(
    (id: string) => router.push(`/messages/${id}`),
    [router],
  );

  return (
    <Screen edgeTop aurora>
      {/*
        A plain header, not `AnimatedHeader`: that one collapses a hero as you
        scroll and needs a shared scroll value to drive it. This screen has no
        hero, so it would be animating against nothing.
      */}
      <View
        className="flex-row items-center gap-3"
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
        <Text variant="h3" accessibilityRole="header">
          Messages
        </Text>
      </View>

      {isLoading ? (
        <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} radius={radius.xl} />
          ))}
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Add friends to start a conversation, or message a host from any event."
          actionLabel="Find people"
          onAction={() => router.push('/(tabs)/discover')}
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              meId={meId}
              onPress={() => open(item.user.id)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View
              className="bg-white/[0.06]"
              style={{ height: 1, marginLeft: screenPadding + 56 }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={brand.purple}
              colors={[brand.purple, brand.cyan]}
              progressBackgroundColor="#0b1024"
            />
          }
          // The rows are a fixed height, so this is cheap and stops the list
          // rendering forty avatars before the first scroll.
          initialNumToRender={12}
        />
      )}
    </Screen>
  );
}
