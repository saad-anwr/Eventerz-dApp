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
 *
 * # Finding people
 *
 * There was no way to. The screen listed the friends you already had and the
 * requests you had already received, and the empty state pointed at Discover -
 * which searches *events*. So the only route to a new friend was to open an
 * event, find them in its attendee list, and tap through; if you knew someone's
 * name and nothing else, the platform had no answer. The website has had a
 * people search since the social features landed.
 *
 * Search is server-side (`userRepository.search`, an `ilike` over name and
 * handle) rather than a filter over the loaded list, because the loaded list is
 * the viewer's own friends - filtering it can only ever return people they have
 * already added, which is the opposite of what searching for someone is for.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageCircle, Search, UserPlus, Users, X } from '@/components/ui/icon';
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
import { useRefresh } from '@/hooks/use-refresh';
import { useUserSearch } from '@/hooks/use-users';
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
        <Avatar
          name={request.user.name}
          seed={request.user.id}
          size="md"
          ring
          uri={request.user.avatarUrl}
        />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {request.user.name}
          </Text>
          <Text variant="caption" className="text-muted-foreground">
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
        <Avatar name={user.name} seed={user.id} size="md" ring uri={user.avatarUrl} />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {user.name}
          </Text>
          {user.handle ? (
            <Text variant="caption" className="text-muted-foreground">
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

/**
 * Somebody the viewer is not yet connected to - a search hit, or a suggestion.
 *
 * `FriendButton` rather than a bare "Add" so the row reports the real state of
 * the pair: a request already sent reads "Requested", one waiting on the viewer
 * offers Accept, and an existing friend offers Message. A plain Add button
 * would let someone send a second request to a person who had already asked
 * them.
 */
function DiscoverRow({
  user,
  onOpen,
}: {
  user: User;
  onOpen: () => void;
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
        <Avatar name={user.name} seed={user.id} size="md" uri={user.avatarUrl} />
        <View className="flex-1">
          <Text variant="title" numberOfLines={1}>
            {user.name}
          </Text>
          <Text variant="caption" className="text-muted-foreground" numberOfLines={1}>
            {user.handle ? `@${user.handle}` : 'Eventerz member'}
            {user.reputation > 0 ? ` · ${user.reputation} rep` : ''}
          </Text>
        </View>
      </PressableFade>

      <FriendButton userId={user.id} name={user.name} />
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const meId = useWalletStore((s) => s.user?.id ?? null);

  const friends = useFriends(meId ?? undefined);
  const pending = usePendingFriendRequests(meId ?? undefined);
  const respond = useRespondToFriendRequest();
  const remove = useRemoveFriend();

  const [searchInput, setSearchInput] = useState('');
  // Debounced so typing a name does not fire a query per keystroke, matching
  // Discover's search.
  const query = useDebouncedValue(searchInput.trim(), 300);
  const searching = query.length > 0;

  /*
   * With no query this is the "people on Eventerz" list, which is what makes
   * the tab useful to somebody who has no friends yet and nobody in mind to
   * look for. `search('')` returns the first page of profiles rather than
   * nothing, so one hook covers both.
   */
  const people = useUserSearch(query);

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
  /*
   * `?? []` inside the render body allocates a fresh array whenever the query
   * has no data, so using it directly as a `useMemo` dependency defeats the
   * memo - the identity changes every render. Memoising the fallbacks keeps
   * `known` and `discover` stable.
   */
  const requests = useMemo(() => pending.data ?? [], [pending.data]);
  const list = useMemo(() => friends.data ?? [], [friends.data]);

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
          // `Screen` already applies `insets.top` (its `edgeTop` default), so
          // adding it again here double-padded the header - which only became
          // obvious once this was a tab root with nothing above it.
          paddingTop: 8,
          paddingHorizontal: screenPadding,
          paddingBottom: 12,
        }}
      >
        {/*
          No back button: this is a tab root now, not a pushed screen. A back
          arrow on a tab either does nothing or drops the user out of the tab
          they just chose.
        */}
        <Text variant="h3" accessibilityRole="header">
          Friends
        </Text>
        {list.length > 0 && (
          <View
            className="ml-auto border border-white/10 bg-white/[0.05] px-2"
            style={{ borderRadius: radius.full, paddingVertical: 2 }}
          >
            <Text variant="micro" className="text-muted-foreground">
              {list.length}
            </Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: screenPadding, paddingBottom: 12 }}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search people by name or @handle"
          icon={Search}
        />
      </View>

      {searching ? (
        /*
         * Search replaces the whole list rather than filtering it in place. The
         * viewer asked about a specific person, and interleaving them with
         * "Requests" and "All friends" headers buries the one row they are
         * looking for.
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
              <DiscoverRow
                user={item}
                onOpen={() => openProfile(item.id)}
              />
            )}
            ItemSeparatorComponent={() => (
              <View
                className="bg-white/[0.06]"
                style={{ height: 1, marginLeft: screenPadding + 56 }}
              />
            )}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )
      ) : loading ? (
        <View className="gap-3" style={{ paddingHorizontal: screenPadding }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} radius={radius.xl} />
          ))}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View className="pb-2">
                <Text
                  variant="label"
                  className="text-muted-foreground"
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
                    className="text-muted-foreground"
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
          ListFooterComponent={
            /*
             * Discovery lives under the friends list rather than behind a
             * separate screen. This tab is the answer to "who else is here",
             * and an account with no friends previously got an empty state
             * pointing at the *event* search - which cannot find a person.
             */
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
                    {list.length > 0 ? 'Discover people' : 'People on Eventerz'}
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
            ) : list.length === 0 && requests.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No one to show yet"
                description="Search by name or @handle above, or meet people at an event."
                actionLabel="Browse events"
                onAction={() => router.push('/(tabs)/explore')}
              />
            ) : null
          }
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
