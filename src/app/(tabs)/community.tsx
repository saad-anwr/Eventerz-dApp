/**
 * Community - friends, requests and messages in one place.
 *
 * # Why these three are one tab
 *
 * They were three destinations (a Friends tab, a Messages route, a requests
 * strip inside Friends) reached from four entry points, two of which were
 * header icons duplicating tabs that already existed. Every one of them is the
 * same question - who do I know here, and what is waiting on me - so they are
 * one tab with three segments and a single count on the bar.
 *
 * Requests sits in the middle rather than first. It is the only segment that
 * can be empty *and* urgent, so it carries the badge; leading with it would put
 * a usually-empty list in front of the list people actually open this for.
 *
 * # Finding people
 *
 * Search is server-side (`userRepository.search`, an `ilike` over name and
 * handle), not a filter over the loaded rows. Filtering the friends list can
 * only ever return people already added, which is the opposite of what
 * searching for someone is for.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GoogleGate, useHasGoogleAccount } from '@/features/auth/google-gate';
import { SegmentedControl } from '@/components/ui/form';
import {
  Coins,
  MessageCircle,
  Search,
  UserPlus,
  Users,
  X,
} from '@/components/ui/icon';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SearchBar } from '@/components/ui/search-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FriendButton } from '@/features/social/friend-button';
import { queryKeys } from '@/hooks/query-keys';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  useFriends,
  usePendingFriendRequests,
  useRemoveFriend,
  useRespondToFriendRequest,
} from '@/hooks/use-friends';
import { useConversations } from '@/hooks/use-messages';
import { useRefresh } from '@/hooks/use-refresh';
import { useUserSearch } from '@/hooks/use-users';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { accents } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import type { Conversation, User } from '@/types';
import { timeAgo } from '@/utils/format';
import { haptics } from '@/utils/haptics';

import type { PendingRequest } from '@/repositories/supabase/friends';

type Segment = 'friends' | 'requests' | 'messages';

/* -------------------------------------------------------------------------- */
/*  Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The shape every person row on this screen shares: tap the left half to open
 * the profile, act on the right.
 *
 * Requests, friends and discovery each had their own copy of the container,
 * the press target, the avatar and the name - so a change to any of it landed
 * on one list and left the other two looking different.
 */
function PersonRow({
  name,
  id,
  avatarUrl,
  ring,
  subtitle,
  onOpen,
  trailing,
}: {
  name: string;
  id: string;
  avatarUrl?: string | null;
  /** Marks a connection, so friends and pending requests carry it. */
  ring?: boolean;
  subtitle: React.ReactNode;
  onOpen: () => void;
  trailing: React.ReactNode;
}) {
  return (
    <View
      className="flex-row items-center gap-3 py-3"
      style={{ paddingHorizontal: screenPadding }}
    >
      <PressableFade
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}`}
        className="flex-row items-center gap-3"
        style={{ flex: 1 }}
      >
        <Avatar name={name} seed={id} size="md" ring={ring} uri={avatarUrl} />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {name}
          </Text>
          {subtitle}
        </View>
      </PressableFade>

      {trailing}
    </View>
  );
}

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
    <PersonRow
      name={request.user.name}
      id={request.user.id}
      avatarUrl={request.user.avatarUrl}
      ring
      onOpen={onOpen}
      subtitle={
        <Text variant="caption" className="text-muted-foreground">
          {request.outgoing ? 'Request sent' : 'Wants to be friends'}
        </Text>
      }
      /*
        An outgoing request gets one action, not two. There is nothing to accept
        - the decision belongs to the other person - so offering Accept would be
        a button that cannot mean anything.
      */
      trailing={
        request.outgoing ? (
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
            <Button label="Accept" size="sm" disabled={busy} onPress={onAccept} />
          </View>
        )
      }
    />
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
    <PersonRow
      name={user.name}
      id={user.id}
      avatarUrl={user.avatarUrl}
      ring
      onOpen={onOpen}
      subtitle={
        user.handle ? (
          <Text variant="caption" className="text-muted-foreground">
            @{user.handle}
          </Text>
        ) : null
      }
      trailing={
        <IconButton
          icon={MessageCircle}
          label={`Message ${user.name}`}
          onPress={onMessage}
          variant="secondary"
          size={36}
          iconSize={16}
        />
      }
    />
  );
}

/**
 * Somebody the viewer is not connected to - a search hit, or a suggestion.
 *
 * `FriendButton` rather than a bare Add, so the row reports the real state of
 * the pair: a request already sent reads as sent, one waiting on the viewer
 * offers Accept, an existing friend offers Message. A plain Add would let
 * someone send a second request to a person who had already asked them.
 */
function DiscoverRow({ user, onOpen }: { user: User; onOpen: () => void }) {
  return (
    <PersonRow
      name={user.name}
      id={user.id}
      avatarUrl={user.avatarUrl}
      onOpen={onOpen}
      subtitle={
        <Text
          variant="caption"
          className="text-muted-foreground"
          numberOfLines={1}
        >
          {user.handle ? `@${user.handle}` : 'Eventerz member'}
          {user.reputation > 0 ? ` · ${user.reputation} rep` : ''}
        </Text>
      }
      trailing={<FriendButton userId={user.id} name={user.name} />}
    />
  );
}

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
      <Avatar name={user.name} seed={user.id} size="md" ring uri={user.avatarUrl} />

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
            {last.kind === 'payment' && <Coins size={11} color={accents.green} />}
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

const SEPARATOR = () => (
  <View
    className="bg-white/[0.06]"
    style={{ height: 1, marginLeft: screenPadding + 56 }}
  />
);

/* -------------------------------------------------------------------------- */
/*  Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function CommunityScreen() {
  const router = useRouter();
  const meId = useWalletStore((s) => s.user?.id ?? null);
  // Community is Google-gated - see the note at the gate below.
  const hasGoogle = useHasGoogleAccount();

  const [segment, setSegment] = useState<Segment>('friends');
  const [searchInput, setSearchInput] = useState('');

  const friends = useFriends(meId ?? undefined);
  const pending = usePendingFriendRequests(meId ?? undefined);
  const conversations = useConversations(meId ?? undefined);
  const respond = useRespondToFriendRequest();
  const remove = useRemoveFriend();

  // Debounced so typing a name does not fire a query per keystroke.
  const query = useDebouncedValue(searchInput.trim(), 300);
  const searching = query.length > 0;

  /*
   * With no query this is the "people on Eventerz" list, which is what makes
   * the tab useful to somebody who has no friends yet and nobody in mind to
   * look for. `search('')` returns the first page of profiles rather than
   * nothing, so one hook covers both.
   */
  const people = useUserSearch(query);

  const { control } = useRefresh(
    [queryKeys.friends.all, queryKeys.messages.all],
    accents.green,
  );

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
              accept
                ? `You and ${request.user.name} are friends`
                : 'Request declined',
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
          toast.error(
            'Could not withdraw',
            e instanceof Error ? e.message : undefined,
          ),
      });
    },
    [remove],
  );

  /*
   * `?? []` in the render body allocates a fresh array whenever a query has no
   * data, so using it directly as a memo dependency defeats the memo - the
   * identity changes every render.
   */
  const requests = useMemo(() => pending.data ?? [], [pending.data]);
  const list = useMemo(() => friends.data ?? [], [friends.data]);
  const threads = useMemo(
    () => conversations.data ?? [],
    [conversations.data],
  );

  // Only requests waiting on *this* user count; an outgoing one is waiting on
  // somebody else and needs nothing from them.
  const incoming = useMemo(
    () => requests.filter((r) => !r.outgoing).length,
    [requests],
  );

  /*
   * Anyone already on this screen in another role is dropped from discovery.
   * Showing an existing friend under "Discover people" invites the viewer to
   * add someone they added months ago, and showing a pending requester there
   * offers Add next to the Accept button two rows above it.
   */
  const known = useMemo(() => {
    const ids = new Set<string>(list.map((u) => u.id));
    requests.forEach((r) => ids.add(r.user.id));
    if (meId) ids.add(meId);
    return ids;
  }, [list, requests, meId]);

  const discover = useMemo(
    () => (people.data ?? []).filter((u) => !known.has(u.id)),
    [people.data, known],
  );

  return (
    <Screen edgeTop aurora>
      <View
        className="flex-row items-center gap-3"
        style={{
          // `Screen` already applies `insets.top`, so adding it again here
          // double-pads a tab root.
          paddingTop: 8,
          paddingHorizontal: screenPadding,
          paddingBottom: 12,
        }}
      >
        <Text variant="h3" accessibilityRole="header">
          Community
        </Text>
      </View>

      {/*
        Community is the one surface that needs a Google account.

        A wallet-only user reaches every other screen - browsing, events,
        tickets, RSVP - and is stopped only here, where the content is other
        people. Showing the segments and three empty lists instead would be
        worse than a gate: it looks like nobody uses the app, rather than like
        the viewer has not signed in.
      */}
      {!hasGoogle ? (
        <GoogleGate />
      ) : (
      <>
      <View style={{ paddingHorizontal: screenPadding, paddingBottom: 12 }}>
        <SegmentedControl
          options={[
            { value: 'friends', label: 'Friends', count: list.length },
            { value: 'requests', label: 'Requests', count: incoming },
            { value: 'messages', label: 'Messages', count: threads.length },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </View>

      {segment === 'friends' && (
        <>
          <View style={{ paddingHorizontal: screenPadding, paddingBottom: 10 }}>
            <SearchBar
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search people by name or @handle"
              icon={Search}
            />
          </View>

          {searching ? (
            /*
             * Search replaces the list rather than filtering it. The viewer
             * asked about a specific person; interleaving them with section
             * headers buries the one row they are looking for.
             */
            people.isLoading ? (
              <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={56} radius={radius.xl} />
                ))}
              </View>
            ) : (people.data ?? []).length === 0 ? (
              <EmptyState
                icon={Search}
                title={`No one matching "${query}"`}
                description="Names and @handles only - try a shorter search, or ask them for their handle."
              />
            ) : (
              <FlatList
                data={(people.data ?? []).filter((u) => u.id !== meId)}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <DiscoverRow user={item} onOpen={() => openProfile(item.id)} />
                )}
                ItemSeparatorComponent={SEPARATOR}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 32 }}
              />
            )
          ) : friends.isLoading ? (
            <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={56} radius={radius.xl} />
              ))}
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <FriendRow
                  user={item}
                  onOpen={() => openProfile(item.id)}
                  onMessage={() => openThread(item.id)}
                />
              )}
              ItemSeparatorComponent={SEPARATOR}
              ListFooterComponent={
                discover.length > 0 ? (
                  <View style={{ paddingTop: list.length > 0 ? 22 : 4 }}>
                    <View
                      className="flex-row items-center gap-2"
                      style={{
                        paddingHorizontal: screenPadding,
                        paddingBottom: 6,
                      }}
                    >
                      <UserPlus size={13} color="#94a2b8" strokeWidth={2.2} />
                      <Text variant="label" className="text-muted-foreground">
                        {list.length > 0
                          ? 'Discover people'
                          : 'People on Eventerz'}
                      </Text>
                    </View>
                    {discover.map((user) => (
                      <DiscoverRow
                        key={user.id}
                        user={user}
                        onOpen={() => openProfile(user.id)}
                      />
                    ))}
                  </View>
                ) : list.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No one to show yet"
                    description="Search by name or @handle above, or meet people at an event."
                    actionLabel="Browse events"
                    onAction={() => router.push('/explore')}
                  />
                ) : null
              }
              contentContainerStyle={{ paddingBottom: 32 }}
              refreshControl={control}
            />
          )}
        </>
      )}

      {segment === 'requests' &&
        (pending.isLoading ? (
          <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={56} radius={radius.xl} />
            ))}
          </View>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No pending requests"
            description="Friend requests you send or receive show up here."
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <RequestRow
                request={item}
                busy={busy}
                onOpen={() => openProfile(item.user.id)}
                onAccept={() => handleRespond(item, true)}
                onDecline={() => handleRespond(item, false)}
                onCancel={() => handleCancel(item)}
              />
            )}
            ItemSeparatorComponent={SEPARATOR}
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={control}
          />
        ))}

      {segment === 'messages' &&
        (conversations.isLoading ? (
          <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={56} radius={radius.xl} />
            ))}
          </View>
        ) : threads.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Add friends to start a conversation, or message a host from any event."
            actionLabel="Find people"
            onAction={() => setSegment('friends')}
          />
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(item) => item.user.id}
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                meId={meId}
                onPress={() => openThread(item.user.id)}
              />
            )}
            ItemSeparatorComponent={SEPARATOR}
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={control}
          />
        ))}
      </>
      )}
    </Screen>
  );
}
