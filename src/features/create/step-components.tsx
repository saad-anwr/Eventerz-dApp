/**
 * Create-event wizard steps.
 *
 * Each step is a pure function of the draft store - no props threading, no
 * local mirrors of form state - so the wizard can jump to any step and the
 * preview can read the same draft without duplication.
 */

import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { memo, useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FieldGroup, SwitchRow, TextField } from '@/components/ui/form';
import {
  Calendar,
  Clock,
  Globe,
  ImageIcon,
  Lock,
  Ticket,
  Users,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { toast } from '@/store/toast-store';
import { useCreateEventStore } from '@/store/create-event-store';
import { LocationPicker } from './location-picker';
import {
  brand,
  coverGradientKeys,
  resolveCoverGradient,
} from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { EVENT_CATEGORIES } from '@/types';
import {
  formatEventDateLong,
  formatEventTimeRange,
} from '@/utils/format';
import { haptics } from '@/utils/haptics';

const SUGGESTED_TAGS = [
  'Networking',
  'Beginner-friendly',
  'Free food',
  'Demo day',
  'Token-gated',
  'Online',
  'Rust',
  'NFTs',
  'DeFi',
  'Design',
];

/* -------------------------------------------------------------------------- */
/*  1 - Basics                                                                 */
/* -------------------------------------------------------------------------- */

export const BasicsStep = memo(function BasicsStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const errors = useCreateEventStore((s) => s.errors);
  const setField = useCreateEventStore((s) => s.setField);

  return (
    <View className="gap-6">
      <TextField
        label="Event name"
        placeholder="Solana Superteam Summit"
        value={draft.title}
        onChangeText={(text) => setField('title', text)}
        error={errors.title}
        maxLength={70}
        returnKeyType="next"
      />

      <TextField
        label="Description"
        placeholder="What should guests expect? Who is it for?"
        value={draft.description}
        onChangeText={(text) => setField('description', text)}
        error={errors.description}
        hint="Markdown is not supported yet - plain text reads best."
        maxLength={600}
        multiline
      />

      <FieldGroup title="Category">
        <View className="flex-row flex-wrap gap-2">
          {EVENT_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={draft.category === category}
              onPress={() => setField('category', category)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup
        title="Tags"
        description="Up to five - they drive search and recommendations."
      >
        <View className="flex-row flex-wrap gap-2">
          {SUGGESTED_TAGS.map((tag) => {
            const selected = draft.tags.includes(tag);
            return (
              <Chip
                key={tag}
                label={tag}
                selected={selected}
                onPress={() => {
                  if (!selected && draft.tags.length >= 5) {
                    toast.info('Five tags is the limit', 'Remove one to add another.');
                    return;
                  }
                  useCreateEventStore.getState().toggleTag(tag);
                }}
              />
            );
          })}
        </View>
      </FieldGroup>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  2 - Schedule                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Date/time entry.
 *
 * A full calendar picker needs `@react-native-community/datetimepicker`, which
 * is not in Expo Go. Rather than ship a broken picker, this offers relative
 * presets that cover the common cases and writes real ISO timestamps.
 */
const DATE_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'This weekend', days: 5 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
  { label: 'In a month', days: 30 },
] as const;

const TIME_PRESETS = [9, 12, 15, 18, 19, 20] as const;

const DURATION_PRESETS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
  { label: 'All day', hours: 8 },
] as const;

export const ScheduleStep = memo(function ScheduleStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const errors = useCreateEventStore((s) => s.errors);
  const setField = useCreateEventStore((s) => s.setField);

  const start = useMemo(() => new Date(draft.startsAt), [draft.startsAt]);
  const durationHours = useMemo(() => {
    const end = new Date(draft.endsAt);
    return Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (60 * 60 * 1000)),
    );
  }, [draft.endsAt, start]);

  const setDays = useCallback(
    (days: number) => {
      const next = new Date();
      next.setDate(next.getDate() + days);
      next.setHours(start.getHours(), 0, 0, 0);
      const nextEnd = new Date(next);
      nextEnd.setHours(nextEnd.getHours() + durationHours);
      setField('startsAt', next.toISOString());
      setField('endsAt', nextEnd.toISOString());
    },
    [durationHours, setField, start],
  );

  const setHour = useCallback(
    (hour: number) => {
      const next = new Date(draft.startsAt);
      next.setHours(hour, 0, 0, 0);
      const nextEnd = new Date(next);
      nextEnd.setHours(nextEnd.getHours() + durationHours);
      setField('startsAt', next.toISOString());
      setField('endsAt', nextEnd.toISOString());
    },
    [draft.startsAt, durationHours, setField],
  );

  const setDuration = useCallback(
    (hours: number) => {
      const nextEnd = new Date(draft.startsAt);
      nextEnd.setHours(nextEnd.getHours() + hours);
      setField('endsAt', nextEnd.toISOString());
    },
    [draft.startsAt, setField],
  );

  const selectedDays = Math.round(
    (new Date(draft.startsAt).setHours(0, 0, 0, 0) -
      new Date().setHours(0, 0, 0, 0)) /
      (24 * 60 * 60 * 1000),
  );

  return (
    <View className="gap-6">
      {/* Summary */}
      <View
        className="border border-brand-purple/25 bg-brand-purple/[0.07] p-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <View className="flex-row items-center gap-2">
          <Calendar size={15} color={brand.purple} strokeWidth={2.2} />
          <Text variant="title">{formatEventDateLong(draft.startsAt)}</Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2">
          <Clock size={15} color={brand.cyan} strokeWidth={2.2} />
          <Text variant="bodySm" className="text-muted-foreground">
            {formatEventTimeRange(draft.startsAt, draft.endsAt)}
          </Text>
        </View>
      </View>

      <FieldGroup title="Starts">
        <View className="flex-row flex-wrap gap-2">
          {DATE_PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              selected={selectedDays === preset.days}
              onPress={() => setDays(preset.days)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup title="Time">
        <View className="flex-row flex-wrap gap-2">
          {TIME_PRESETS.map((hour) => (
            <Chip
              key={hour}
              label={new Date(0, 0, 0, hour).toLocaleTimeString('en-US', {
                hour: 'numeric',
              })}
              selected={start.getHours() === hour}
              onPress={() => setHour(hour)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup title="Duration">
        <View className="flex-row flex-wrap gap-2">
          {DURATION_PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              selected={durationHours === preset.hours}
              onPress={() => setDuration(preset.hours)}
            />
          ))}
        </View>
        {errors.endsAt && (
          <Text variant="caption" className="text-red-400">
            {errors.endsAt}
          </Text>
        )}
      </FieldGroup>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  3 - Location                                                               */
/* -------------------------------------------------------------------------- */

export const LocationStep = memo(function LocationStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const errors = useCreateEventStore((s) => s.errors);
  const setField = useCreateEventStore((s) => s.setField);

  return (
    <View className="gap-6">
      <View
        className="border border-white/10 bg-white/[0.03] px-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <SwitchRow
          title="Online event"
          description="Guests join from anywhere with a link"
          icon={Globe}
          value={draft.isOnline}
          onValueChange={(next) => setField('isOnline', next)}
        />
      </View>

      {draft.isOnline ? (
        <TextField
          label="Meeting link"
          placeholder="https://meet.example.com/eventerz"
          value={draft.location}
          onChangeText={(text) => setField('location', text)}
          icon={Globe}
          hint="Shared with confirmed guests only, 1 hour before the start."
          autoCapitalize="none"
          keyboardType="url"
        />
      ) : (
        <>
          {/*
            A real place picker, replacing the "arrives with the native build"
            placeholder that used to sit here. It needs no native module: search
            is an HTTP call and the preview is a static image, so it works in Expo
            Go and in a release build alike. See `utils/maps.ts` for why an
            interactive map was the wrong trade.
          */}
          <LocationPicker
            label="Venue"
            placeholder="Norrsken House, Stockholm"
            value={{
              location: draft.location,
              latitude: draft.latitude,
              longitude: draft.longitude,
              placeId: draft.placeId,
              address: draft.address,
            }}
            onChange={(next) => {
              setField('location', next.location);
              setField('latitude', next.latitude);
              setField('longitude', next.longitude);
              setField('placeId', next.placeId);
              setField('address', next.address);
            }}
          />
          {errors.location && (
            <Text variant="caption" style={{ color: '#fca5a5' }}>
              {errors.location}
            </Text>
          )}
        </>
      )}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  4 - Design                                                                 */
/* -------------------------------------------------------------------------- */

export const DesignStep = memo(function DesignStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const setField = useCreateEventStore((s) => s.setField);

  const pickImage = useCallback(async () => {
    haptics.light();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error(
        'Photo access needed',
        'Enable photo permissions to use a custom banner.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setField('coverImage', result.assets[0].uri);
      toast.success('Banner added');
    }
  }, [setField]);

  const colors = resolveCoverGradient(draft.coverGradient);

  return (
    <View className="gap-6">
      <FieldGroup
        title="Cover"
        description="Shown on the card, the hero and the NFT ticket stub."
      >
        <View
          className="overflow-hidden"
          style={{ height: 150, borderRadius: radius['3xl'] }}
        >
          <LinearGradient
            colors={[colors[0], colors[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.3)', 'transparent']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.8, y: 0.9 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View className="mt-auto p-4">
            <Text variant="title" style={{ color: '#ffffff' }} numberOfLines={1}>
              {draft.title || 'Your event name'}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row flex-wrap gap-2.5">
          {coverGradientKeys.map((key) => {
            const stops = resolveCoverGradient(key);
            const selected = draft.coverGradient === key;
            return (
              <PressableScale
                key={key}
                onPress={() => {
                  haptics.selection();
                  setField('coverGradient', key);
                }}
                hapticFeedback={false}
                scaleTo={0.9}
                accessibilityRole="button"
                accessibilityLabel={`Cover gradient ${key.replace('-', ' to ')}`}
                accessibilityState={{ selected }}
                className="overflow-hidden"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.lg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected
                    ? brand.cyan
                    : 'rgba(255,255,255,0.12)',
                }}
              >
                <LinearGradient
                  colors={[stops[0], stops[1]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1 }}
                />
              </PressableScale>
            );
          })}
        </View>
      </FieldGroup>

      <Button
        label={draft.coverImage ? 'Replace banner image' : 'Upload banner image'}
        icon={ImageIcon}
        variant="secondary"
        onPress={pickImage}
        fullWidth
      />

      <FieldGroup
        title="NFT ticket"
        description="Every RSVP mints a compressed NFT to the guest's wallet."
      >
        <TextField
          label="Ticket tier name"
          placeholder="General Admission"
          value={draft.ticketTier}
          onChangeText={(text) => setField('ticketTier', text)}
          icon={Ticket}
        />

        <View
          className="mt-1 border border-white/10 bg-white/[0.03] px-4"
          style={{ borderRadius: radius['2xl'] }}
        >
          <SwitchRow
            title="Soulbound tickets"
            description="Non-transferable - stops scalping, blocks gifting"
            icon={Lock}
            value={draft.soulboundTickets}
            onValueChange={(next) => setField('soulboundTickets', next)}
          />
        </View>
      </FieldGroup>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  5 - Access                                                                 */
/* -------------------------------------------------------------------------- */

export const AccessStep = memo(function AccessStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const errors = useCreateEventStore((s) => s.errors);
  const setField = useCreateEventStore((s) => s.setField);

  return (
    <View className="gap-6">
      <TextField
        label="Capacity"
        placeholder="100"
        value={draft.capacity}
        onChangeText={(text) =>
          setField('capacity', text.replace(/[^0-9]/g, ''))
        }
        error={errors.capacity}
        icon={Users}
        keyboardType="number-pad"
        hint="Guests beyond this join a waitlist."
      />

      <FieldGroup title="Visibility">
        <View className="flex-row flex-wrap gap-2">
          {(['public', 'unlisted', 'private'] as const).map((value) => (
            <Chip
              key={value}
              label={value[0].toUpperCase() + value.slice(1)}
              selected={draft.visibility === value}
              onPress={() => setField('visibility', value)}
            />
          ))}
        </View>
        <Text variant="caption" className="text-muted-foreground">
          {draft.visibility === 'public'
            ? 'Anyone can find this in Discover.'
            : draft.visibility === 'unlisted'
              ? 'Only people with the link can see it.'
              : 'Invite-only - hidden from search entirely.'}
        </Text>
      </FieldGroup>

      <View
        className="border border-white/10 bg-white/[0.03] px-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <SwitchRow
          title="Free event"
          description="No ticket price - guests only pay network fees"
          icon={Ticket}
          value={draft.isFree}
          onValueChange={(next) => {
            setField('isFree', next);
            setField('price', next ? 'Free' : '0.5 SOL');
          }}
        />
      </View>

      {!draft.isFree && (
        <TextField
          label="Ticket price"
          placeholder="0.5 SOL"
          value={draft.price}
          onChangeText={(text) => setField('price', text)}
          error={errors.price}
          hint="Settles straight to your wallet, minus network fees."
        />
      )}

      <View
        className="border border-white/10 bg-white/[0.03] px-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <SwitchRow
          title="Require approval"
          description="You review each RSVP before the ticket mints"
          value={draft.requiresApproval}
          onValueChange={(next) => setField('requiresApproval', next)}
        />
        <View className="h-px bg-white/[0.07]" />
        <SwitchRow
          title="Token gating"
          description="Only wallets holding a specific asset can RSVP"
          icon={Lock}
          value={draft.tokenGated}
          onValueChange={(next) => setField('tokenGated', next)}
        />
      </View>

      {draft.tokenGated && (
        <TextField
          label="Gate requirement"
          placeholder="Holds >= 1 MadLads NFT"
          value={draft.gateRequirement}
          onChangeText={(text) => setField('gateRequirement', text)}
          error={errors.gateRequirement}
          icon={Lock}
          hint="Checked against the guest's wallet at RSVP time."
        />
      )}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  6 - Review                                                                 */
/* -------------------------------------------------------------------------- */

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-2.5">
      <Text variant="bodySm" className="text-muted-foreground">
        {label}
      </Text>
      <Text
        variant="bodySm"
        className="flex-1 text-right"
        numberOfLines={2}
        style={{ fontFamily: fontFamily.medium }}
      >
        {value}
      </Text>
    </View>
  );
}

export const ReviewStep = memo(function ReviewStep() {
  const draft = useCreateEventStore((s) => s.draft);
  const colors = resolveCoverGradient(draft.coverGradient);

  return (
    <View className="gap-6">
      {/* Card preview */}
      <View>
        <Text variant="label" className="mb-3 uppercase tracking-wider text-muted-foreground">
          Preview
        </Text>
        <View
          className="overflow-hidden border border-white/10 bg-white/[0.035]"
          style={{ borderRadius: radius['3xl'] }}
        >
          <View style={{ height: 128 }}>
            <LinearGradient
              colors={[colors[0], colors[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', inset: 0 }}
            />
            <View className="absolute left-3 top-3 flex-row gap-1.5">
              <Badge label={draft.category} size="sm" />
              {draft.tokenGated && (
                <Badge label="Gated" variant="purple" size="sm" icon={Lock} />
              )}
            </View>
            <View className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1">
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 11,
                  color: '#ffffff',
                }}
              >
                {draft.isFree ? 'Free' : draft.price}
              </Text>
            </View>
          </View>
          <View className="p-4">
            <Text variant="caption" style={{ color: brand.cyan }}>
              {formatEventDateLong(draft.startsAt)}
            </Text>
            <Text variant="title" className="mt-1" numberOfLines={2}>
              {draft.title || 'Untitled event'}
            </Text>
            <Text
              variant="caption"
              className="mt-2 text-muted-foreground"
              numberOfLines={2}
            >
              {draft.description || 'No description yet.'}
            </Text>
          </View>
        </View>
      </View>

      {/* Summary */}
      <View
        className="border border-white/10 bg-white/[0.03] px-4 py-1"
        style={{ borderRadius: radius['2xl'] }}
      >
        <ReviewRow label="When" value={formatEventDateLong(draft.startsAt)} />
        <View className="h-px bg-white/[0.06]" />
        <ReviewRow
          label="Time"
          value={formatEventTimeRange(draft.startsAt, draft.endsAt)}
        />
        <View className="h-px bg-white/[0.06]" />
        <ReviewRow
          label="Where"
          value={draft.isOnline ? 'Online' : draft.location || 'Not set'}
        />
        <View className="h-px bg-white/[0.06]" />
        <ReviewRow label="Capacity" value={`${draft.capacity} guests`} />
        <View className="h-px bg-white/[0.06]" />
        <ReviewRow label="Visibility" value={draft.visibility} />
        <View className="h-px bg-white/[0.06]" />
        <ReviewRow
          label="Ticket"
          value={`${draft.ticketTier}${draft.soulboundTickets ? ' · soulbound' : ''}`}
        />
        {draft.tokenGated && (
          <>
            <View className="h-px bg-white/[0.06]" />
            <ReviewRow
              label="Gate"
              value={draft.gateRequirement || 'Not specified'}
            />
          </>
        )}
      </View>

      <View
        className="flex-row items-start gap-2.5 border border-brand-cyan/25 bg-brand-cyan/[0.06] p-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        <Ticket size={16} color={brand.cyan} strokeWidth={2.2} />
        <Text variant="caption" className="flex-1 text-muted-foreground">
          Publishing writes the event on-chain and opens RSVPs. You approve the
          transaction in your wallet - Eventerz never signs on your behalf.
        </Text>
      </View>
    </View>
  );
});

/** Scrollable wrapper shared by every step. */
export const StepScroll = memo(function StepScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      {children}
    </ScrollView>
  );
});
