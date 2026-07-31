/**
 * Friends.
 *
 * The website has had a `/friends` page since the social features landed; the
 * app could read friendships (the inbox is friends union DM partners) but had
 * no way to create or end one. A friendship made on the phone was impossible,
 * which is the wrong way round for the platform most people will use.
 *
 * Requests come first, above the list. A pending request is the only thing on
 * this screen that is waiting on the viewer, and burying it under an
 * alphabetical list of people they already know is how requests go unanswered.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, MessageCircle, Users, X } from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { queryKeys } from '@/hooks/query-keys';
import {
  useFriends,
  usePendingFriendRequests,
  useRemoveFriend,
  useRespondToFriendRequest,
} from '@/hooks/use-friends';
import { useRefresh } from '@/hooks/use-refresh';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents, brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import type { User } from '@/types';
import { haptics } from '@/utils/haptics';

import type { PendingRequest } from '@/repositories/supabase/friends';

function RequestRow({
  request,
  onAccept,
  onDecline,
  onCancel,
  onOpen,
  busy,
}: {
  request: PendingRequest;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <View
      className="flex-row items-center gap-3 py-3"
      style={{ paddingHorizontal: screenPadding }}
    >
      <PressableFade
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${request.user.name}`}
        className="flex-row items-center gap-3"
        style={{ flex: 1 }}
      >
        <Avatar name={request.user.name} seed={request.user.id} size="md" ring />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {request.user.name}
          </Text>
          <Text variant="caption" className="text-muted">
            {request.outgoing ? 'Request sent' : 'Wants to be friends'}
          </Text>
        </View>
      </PressableFade>

      {/*
        An outgoing request gets one action, not two. There is nothing to accept
        - the decision belongs to the other person - so offering Accept would be
        a button that cannot mean anything.
      */}
      {request.outgoing ? (
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={onCancel}
        />
      ) : (
        <View className="flex-row items-center gap-2">
          <IconButton
            icon={X}
            label={`Decline ${request.user.name}`}
            onPress={onDecline}
            variant="secondary"
            size={36}
            iconSize={16}
            disabled={busy}
          />
          {/* `Button` rather than `IconButton` for the accept: IconButton has
              no primary variant, and accept is the affirmative action - it
              should not look identical to decline. */}
          <Button
            label="Accept"
            size="sm"
            disabled={busy}
            onPress={onAccept}
          />
        </View>
      )}
    </View>
  );
}

function FriendRow({
  user,
  onOpen,
  onMessage,
}: {
  user: User;
  onOpen: () => void;
  onMessage: () => void;
}) {
  return (
    <View
      className="flex-row items-center gap-3 py-3"
      style={{ paddingHorizontal: screenPadding }}
    >
      <PressableFade
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${user.name}`}
        className="flex-row items-center gap-3"
        style={{ flex: 1 }}
      >
        <Avatar name={user.name} seed={user.id} size="md" ring />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {user.name}
          </Text>
          {user.handle ? (
            <Text variant="caption" className="text-muted">
              @{user.handle}
            </Text>
          ) : null}
        </View>
      </PressableFade>

      <IconButton
        icon={MessageCircle}
        label={`Message ${user.name}`}
        onPress={onMessage}
        variant="secondary"
        size={36}
        iconSize={16}
      />
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const meId = useWalletStore((s) => s.user?.id ?? null);

  const friends = useFriends(meId ?? undefined);
  const pending = usePendingFriendRequests(meId ?? undefined);
  const respond = useRespondToFriendRequest();
  const remove = useRemoveFriend();

  const { refreshing, onRefresh } = useRefresh([queryKeys.friends.all]);

  const busy = respond.isPending || remove.isPending;

  const openProfile = useCallback(
    (id: string) => router.push(`/user/${id}`),
    [router],
  );

  const openThread = useCallback(
    (id: string) => router.push(`/messages/${id}`),
    [router],
  );

  const handleRespond = useCallback(
    (request: PendingRequest, accept: boolean) => {
      haptics.selection();
      respond.mutate(
        { id: request.id, accept },
        {
          onSuccess: () =>
            toast.success(
              accept ? `You and ${request.user.name} are friends` : 'Request declined',
            ),
          onError: (e) =>
            toast.error(
              'Could not respond',
              e instanceof Error ? e.message : undefined,
            ),
        },
      );
    },
    [respond],
  );

  const handleCancel = useCallback(
    (request: PendingRequest) => {
      haptics.selection();
      remove.mutate(request.id, {
        onSuccess: () => toast.success('Request withdrawn'),
        onError: (e) =>
          toast.error('Could not withdraw', e instanceof Error ? e.message : undefined),
      });
    },
    [remove],
  );

  const loading = friends.isLoading || pending.isLoading;
  const requests = pending.data ?? [];
  const list = friends.data ?? [];

  return (
    <Screen edgeTop aurora>
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
          Friends
        </Text>
        {list.length > 0 && (
          <View
            className="ml-auto border border-white/10 bg-white/[0.05] px-2"
            style={{ borderRadius: radius.full, paddingVertical: 2 }}
          >
            <Text variant="micro" className="text-muted">
              {list.length}
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} radius={radius.xl} />
          ))}
        </View>
      ) : list.length === 0 && requests.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No friends yet"
          description="Find people at events you have been to, or from any profile."
          actionLabel="Discover"
          onAction={() => router.push('/(tabs)/discover')}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View className="pb-2">
                <Text
                  variant="label"
                  className="text-muted"
                  style={{
                    paddingHorizontal: screenPadding,
                    paddingTop: 4,
                    paddingBottom: 4,
                  }}
                >
                  Requests
                </Text>
                {requests.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    busy={busy}
                    onOpen={() => openProfile(request.user.id)}
                    onAccept={() => handleRespond(request, true)}
                    onDecline={() => handleRespond(request, false)}
                    onCancel={() => handleCancel(request)}
                  />
                ))}
                {list.length > 0 && (
                  <Text
                    variant="label"
                    className="text-muted"
                    style={{
                      paddingHorizontal: screenPadding,
                      paddingTop: 14,
                      paddingBottom: 4,
                    }}
                  >
                    All friends
                  </Text>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <FriendRow
              user={item}
              onOpen={() => openProfile(item.id)}
              onMessage={() => openThread(item.id)}
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
              colors={[brand.purple, accents.green]}
              progressBackgroundColor="#0b1024"
            />
          }
        />
      )}
    </Screen>
  );
}
