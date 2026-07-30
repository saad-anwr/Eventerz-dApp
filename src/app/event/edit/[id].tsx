/**
 * Edit an event. Host only.
 *
 * Two things make this more than a create form with values in it:
 *
 *   • **Only what changed is sent.** `update_event` treats an omitted field as
 *     "leave alone", which is what makes two devices editing the same event
 *     safe. Posting the whole row back would send stale values for everything
 *     the host did not touch and clobber the other device's change with them.
 *
 *   • **Capacity cannot go below the headcount.** Checked here for a fast,
 *     specific message and again in Postgres because a client check is a
 *     convenience, not a control.
 *
 * Cancellation sits at the bottom, visually separated and behind a confirm step.
 * It is soft — the row survives so ticket holders keep the record — but it closes
 * every live RSVP and notifies everyone, so it is not an action to put next to
 * "Save".
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorState } from '@/components/ui/empty-state';
import { FieldGroup, SwitchRow, TextField } from '@/components/ui/form';
import { ArrowLeft, Globe, Lock, Sparkles, Trash2 } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenLoader } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import {
  LocationPicker,
  type PickedLocation,
} from '@/features/create/location-picker';
import { useCancelEvent, useEvent, useUpdateEvent } from '@/hooks/use-events';
import type { UpdateEventInput } from '@/repositories';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { radius, screenPadding } from '@/theme/layout';
import { EVENT_CATEGORIES, type EventCategory, type EventItem } from '@/types';
import { goingCount, hasEnded, isCancelled } from '@/utils/rsvp';
import { haptics } from '@/utils/haptics';

/** The editable shape, as strings — what the fields actually hold. */
interface Draft {
  title: string;
  description: string;
  category: EventCategory;
  isOnline: boolean;
  capacity: string;
  price: string;
  isPrivate: boolean;
  requiresApproval: boolean;
  tags: string;
}

function draftFrom(event: EventItem): Draft {
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    isOnline: event.isOnline,
    capacity: String(event.capacity),
    price: event.price,
    isPrivate: event.visibility === 'private',
    requiresApproval: event.requiresApproval,
    tags: event.tags.join(', '),
  };
}

export default function EditEventScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const meId = useWalletStore((s) => s.user?.id ?? null);

  const { data: event, isLoading } = useEvent(eventId);
  const update = useUpdateEvent(eventId);
  const cancel = useCancelEvent(eventId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [error, setError] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  /*
   * Seed once, from the first load. Re-seeding on every refetch would discard
   * whatever the host was typing the moment a Realtime event landed — and this
   * screen is subscribed to the very table it edits, so that happens constantly.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!event || seeded.current) return;
    seeded.current = true;
    setDraft(draftFrom(event));
    setPlace({
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
      address: event.address,
    });
  }, [event]);

  const going = useMemo(() => (event ? goingCount(event) : 0), [event]);

  if (isLoading || (event && !draft)) return <ScreenLoader />;

  if (!event) {
    return (
      <Screen edgeTop padded>
        <ErrorState
          title="Event not found"
          description="It may have been removed, or the link is wrong."
          onRetry={() => router.replace('/(tabs)/index')}
        />
      </Screen>
    );
  }

  if (event.hostId !== meId) {
    return (
      <Screen edgeTop padded>
        <ErrorState
          title="Only the host can edit this event"
          description="Ask the organiser to make the change."
          onRetry={() => router.replace(`/event/${eventId}`)}
        />
      </Screen>
    );
  }

  if (isCancelled(event)) {
    return (
      <Screen edgeTop padded>
        <ErrorState
          title="This event was cancelled"
          description="A cancelled event cannot be edited. Create a new one instead."
          onRetry={() => router.replace('/(tabs)/create')}
        />
      </Screen>
    );
  }

  if (!draft || !place) return null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  /** Only the fields that actually differ. See the header note. */
  const buildPatch = (current: Draft, original: EventItem): UpdateEventInput => {
    const patch: UpdateEventInput = {};

    if (current.title.trim() !== original.title) patch.title = current.title.trim();
    if (current.description.trim() !== original.description) {
      patch.description = current.description.trim();
    }
    if (current.category !== original.category) patch.category = current.category;
    if (current.isOnline !== original.isOnline) patch.isOnline = current.isOnline;

    const nextLocation = current.isOnline ? 'Online' : place.location.trim();
    if (nextLocation && nextLocation !== original.location) {
      patch.location = nextLocation;
    }

    // Coordinates travel with the location. An online event drops them — a map
    // of an online event is a map of nowhere.
    if (current.isOnline) {
      if (original.latitude !== undefined) {
        patch.latitude = null;
        patch.longitude = null;
        patch.placeId = null;
        patch.address = null;
      }
    } else if (place.latitude !== original.latitude) {
      patch.latitude = place.latitude ?? null;
      patch.longitude = place.longitude ?? null;
      patch.placeId = place.placeId ?? null;
      patch.address = place.address ?? null;
    }

    const capacity = Math.max(1, Number.parseInt(current.capacity, 10) || 1);
    if (capacity !== original.capacity) patch.capacity = capacity;

    if (current.price.trim() !== original.price) patch.price = current.price.trim();

    const visibility = current.isPrivate ? 'private' : 'public';
    if (visibility !== original.visibility) patch.visibility = visibility;

    if (current.requiresApproval !== original.requiresApproval) {
      patch.requiresApproval = current.requiresApproval;
    }

    const tags = current.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.join(',') !== original.tags.join(',')) patch.tags = tags;

    return patch;
  };

  const save = () => {
    setError('');
    if (!draft.title.trim()) return setError('Give your event a title.');
    if (!draft.isOnline && !place.location.trim()) {
      return setError('Add a location, or mark it online.');
    }

    const capacity = Math.max(1, Number.parseInt(draft.capacity, 10) || 1);
    if (capacity < going) {
      return setError(
        `You already have ${going} confirmed guests. Remove some before lowering capacity to ${capacity}.`,
      );
    }

    const patch = buildPatch(draft, event);
    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }

    haptics.selection();
    update.mutate(patch, {
      onSuccess: () => {
        haptics.success();
        toast.success('Event updated.');
        router.back();
      },
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : 'Could not save your changes.',
        ),
    });
  };

  const confirmCancel = () => {
    setError('');
    cancel.mutate(cancelReason || undefined, {
      onSuccess: () => {
        haptics.success();
        toast.success('Event cancelled. Everyone holding a spot was notified.');
        router.back();
      },
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : 'Could not cancel the event.',
        ),
    });
  };

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
          Edit event
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingBottom: insets.bottom + 40,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {hasEnded(event) && (
          <View
            className="p-3.5"
            style={{
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: 'rgba(251,191,36,0.35)',
              backgroundColor: 'rgba(251,191,36,0.10)',
            }}
          >
            <Text variant="bodySm" style={{ color: '#fcd34d' }}>
              This event has already ended. Edits save but notify nobody.
            </Text>
          </View>
        )}

        <FieldGroup title="Basics">
          <TextField
            label="Title"
            value={draft.title}
            onChangeText={(v) => set('title', v)}
          />
          <TextField
            label="Description"
            value={draft.description}
            onChangeText={(v) => set('description', v)}
            multiline
          />
        </FieldGroup>

        <FieldGroup title="Category">
          <View className="flex-row flex-wrap gap-2">
            {EVENT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={draft.category === c}
                onPress={() => set('category', c)}
              />
            ))}
          </View>
        </FieldGroup>

        <FieldGroup
          title="Where"
          description="Changing the location notifies every live guest."
        >
          <SwitchRow
            title="Online event"
            icon={Globe}
            value={draft.isOnline}
            onValueChange={(v) => set('isOnline', v)}
          />
          {!draft.isOnline && (
            <LocationPicker value={place} onChange={setPlace} />
          )}
        </FieldGroup>

        <FieldGroup title="Access">
          <TextField
            label="Capacity"
            value={draft.capacity}
            onChangeText={(v) => set('capacity', v)}
            keyboardType="number-pad"
            hint={going > 0 ? `${going} confirmed — cannot go below this.` : undefined}
          />
          <TextField
            label="Price"
            value={draft.price}
            onChangeText={(v) => set('price', v)}
            hint='e.g. "Free" or "0.5 SOL"'
          />
          <TextField
            label="Tags"
            value={draft.tags}
            onChangeText={(v) => set('tags', v)}
            hint="Comma-separated"
          />
          <SwitchRow
            title="Private (invite only)"
            icon={Lock}
            value={draft.isPrivate}
            onValueChange={(v) => set('isPrivate', v)}
          />
          <SwitchRow
            title="Require approval"
            icon={Sparkles}
            value={draft.requiresApproval}
            onValueChange={(v) => set('requiresApproval', v)}
          />
        </FieldGroup>

        {error !== '' && (
          <Text variant="bodySm" style={{ color: '#fca5a5' }}>
            {error}
          </Text>
        )}

        <Button
          label={update.isPending ? 'Saving…' : 'Save changes'}
          fullWidth
          size="lg"
          loading={update.isPending}
          onPress={save}
        />

        {/* Cancellation, deliberately separated from the save flow. */}
        <View
          className="gap-3 p-4"
          style={{
            borderRadius: radius['2xl'],
            borderWidth: 1,
            borderColor: 'rgba(248,113,113,0.28)',
            backgroundColor: 'rgba(248,113,113,0.06)',
          }}
        >
          <Text variant="title">Cancel this event</Text>
          <Text variant="bodySm" className="text-muted">
            Everyone holding a spot is notified and their RSVP is closed. The
            event page stays up so ticket holders keep the record — it cannot be
            un-cancelled.
          </Text>

          {confirmingCancel ? (
            <View className="gap-3">
              <TextField
                label="Why? (optional)"
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Venue fell through — we'll reschedule."
                hint="Included in the notification guests receive."
              />
              <Button
                label={
                  cancel.isPending
                    ? 'Cancelling…'
                    : going > 0
                      ? `Yes, cancel and notify ${going}`
                      : 'Yes, cancel this event'
                }
                icon={Trash2}
                variant="danger"
                fullWidth
                loading={cancel.isPending}
                onPress={confirmCancel}
              />
              <Button
                label="Keep it"
                variant="ghost"
                fullWidth
                onPress={() => setConfirmingCancel(false)}
              />
            </View>
          ) : (
            <Button
              label="Cancel event"
              icon={Trash2}
              variant="danger"
              fullWidth
              onPress={() => {
                haptics.warning();
                setConfirmingCancel(true);
              }}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
