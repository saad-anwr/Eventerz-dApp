/**
 * Multi-step Create Event draft.
 *
 * Held in a store rather than local state so the wizard survives navigation to
 * the preview screen and back, and so each step file stays presentational.
 */

import { create } from 'zustand';

import type { CreateEventInput } from '@/repositories';
import type { CoverGradientKey } from '@/theme/colors';
import type { EventCategory, EventVisibility, ScheduleSlot } from '@/types';

export const CREATE_STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'schedule', label: 'When' },
  { id: 'location', label: 'Where' },
  { id: 'design', label: 'Design' },
  { id: 'access', label: 'Access' },
  { id: 'review', label: 'Review' },
] as const;

/**
 * What a host may price a ticket in.
 *
 * Two entries, both first-class on Solana: SOL for the crypto-native case, and
 * USDC for the far more common one - a host who thinks in dollars and does not
 * want the gate price drifting 20% between announcing an event and running it.
 * A ticket is bought weeks ahead, which is exactly the window in which SOL
 * moves enough to matter.
 */
export const PRICE_CURRENCIES = ['SOL', 'USDC'] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

/**
 * The one place an amount and its unit are joined.
 *
 * Every surface that shows a price - the review card, the summary row, the
 * record written to Postgres - goes through here, so a ticket cannot be
 * previewed as "0.5 SOL" and stored as "0.5". The `price` column is `text`
 * (`0002_events.sql`), so the composed string is what persists.
 */
export function formatPrice(draft: Pick<EventDraft, 'isFree' | 'price' | 'priceCurrency'>): string {
  if (draft.isFree) return 'Free';
  const amount = draft.price.trim();
  return amount ? `${amount} ${draft.priceCurrency}` : 'Free';
}

export interface EventDraft {
  title: string;
  description: string;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  location: string;
  /**
   * Structured location, set when the host picks a place rather than typing one.
   * All optional - an event whose venue a geocoder never saw is still a valid
   * event, and requiring these would make the picker mandatory.
   */
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
  isOnline: boolean;
  capacity: string;
  /**
   * The ticket amount **on its own** - `"0.5"`, never `"0.5 SOL"`.
   *
   * It used to carry the unit, because the field was one free-text box and
   * whatever the host typed went straight to the database. That made the unit
   * a typo away from meaningless: `"0.5 sol"`, `"0.5"`, `".5 SOL"` and
   * `"half a sol"` were all accepted and all stored, and nothing downstream
   * could tell a price in SOL from a price in dollars from a price in nothing.
   *
   * Splitting the unit into `priceCurrency` makes it a choice from a fixed set
   * instead of a string, so `formatPrice()` is the only thing that ever decides
   * how the two are joined.
   */
  price: string;
  /** Which asset `price` is denominated in. */
  priceCurrency: PriceCurrency;
  isFree: boolean;
  visibility: EventVisibility;
  requiresApproval: boolean;
  tokenGated: boolean;
  gateRequirement: string;
  tags: string[];
  coverGradient: CoverGradientKey;
  coverImage?: string;
  ticketTier: string;
  soulboundTickets: boolean;
  schedule: ScheduleSlot[];
  communityId?: string;
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

function defaultEnd(): string {
  const d = new Date(defaultStart());
  d.setHours(d.getHours() + 3);
  return d.toISOString();
}

export const EMPTY_DRAFT: EventDraft = {
  title: '',
  description: '',
  category: 'Meetup',
  startsAt: defaultStart(),
  endsAt: defaultEnd(),
  location: '',
  isOnline: false,
  capacity: '100',
  // Empty, not '0.5'. The field is hidden while the event is free, so a
  // pre-filled amount is one the host never saw and never chose - and the
  // moment they flip to paid it becomes a price they have to notice and
  // correct rather than one they had to enter.
  price: '',
  priceCurrency: 'SOL',
  isFree: true,
  visibility: 'public',
  requiresApproval: false,
  tokenGated: false,
  gateRequirement: '',
  tags: [],
  coverGradient: 'purple-blue',
  ticketTier: 'General Admission',
  soulboundTickets: false,
  schedule: [],
};

/** Per-field validation messages, keyed by draft field. */
export type DraftErrors = Partial<Record<keyof EventDraft, string>>;

interface CreateEventState {
  step: number;
  draft: EventDraft;
  errors: DraftErrors;

  setField: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  toggleTag: (tag: string) => void;
  addScheduleSlot: (slot: Omit<ScheduleSlot, 'id'>) => void;
  removeScheduleSlot: (id: string) => void;
  next: () => boolean;
  back: () => void;
  goTo: (step: number) => void;
  /** Validate the current step; returns true when it is safe to advance. */
  validateStep: (step?: number) => boolean;
  reset: () => void;
  toInput: () => CreateEventInput;
}

function validate(step: number, draft: EventDraft): DraftErrors {
  const errors: DraftErrors = {};
  const stepId = CREATE_STEPS[step]?.id;

  if (stepId === 'basics') {
    if (draft.title.trim().length < 3) {
      errors.title = 'Give your event a name of at least 3 characters.';
    }
    if (draft.description.trim().length < 20) {
      errors.description = 'Add at least 20 characters so guests know what to expect.';
    }
  }

  if (stepId === 'schedule') {
    const start = new Date(draft.startsAt).getTime();
    const end = new Date(draft.endsAt).getTime();
    if (Number.isNaN(start)) errors.startsAt = 'Choose a start date and time.';
    if (!Number.isNaN(end) && end <= start) {
      errors.endsAt = 'The end time must be after the start time.';
    }
  }

  if (stepId === 'location' && !draft.isOnline && !draft.location.trim()) {
    errors.location = 'Add a venue, or switch the event to online.';
  }

  if (stepId === 'access') {
    const capacity = Number(draft.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      errors.capacity = 'Capacity must be at least 1.';
    }
    if (draft.tokenGated && !draft.gateRequirement.trim()) {
      errors.gateRequirement = 'Describe what a guest must hold to get in.';
    }
    /*
     * The old check was `/\d/.test(price)` - "contains a digit somewhere",
     * which passed "0 SOL", "abc1" and "1 million". The field now takes digits
     * and one dot only, so the remaining job is to reject the two values that
     * are still typeable and still wrong: nothing at all, and zero.
     *
     * Zero matters on its own. A host who means free has a switch for it that
     * says so on the event; a 0 SOL ticket is a paid event that charges
     * nothing, which reads as free to a guest but keeps every paid-path
     * behaviour behind it.
     */
    if (!draft.isFree) {
      const amount = Number(draft.price);
      if (!draft.price.trim() || !Number.isFinite(amount) || amount <= 0) {
        errors.price = `Enter a ticket price above zero, or switch the event to free.`;
      }
    }
  }

  return errors;
}

export const useCreateEventStore = create<CreateEventState>()((set, get) => ({
  step: 0,
  draft: EMPTY_DRAFT,
  errors: {},

  setField: (key, value) =>
    set((s) => ({
      draft: { ...s.draft, [key]: value },
      // Clear the error for a field as soon as the user edits it.
      errors: { ...s.errors, [key]: undefined },
    })),

  toggleTag: (tag) => {
    const { tags } = get().draft;
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    set((s) => ({ draft: { ...s.draft, tags: next } }));
  },

  addScheduleSlot: (slot) =>
    set((s) => ({
      draft: {
        ...s.draft,
        schedule: [
          ...s.draft.schedule,
          { ...slot, id: `s_${s.draft.schedule.length}_${Date.now()}` },
        ],
      },
    })),

  removeScheduleSlot: (id) =>
    set((s) => ({
      draft: {
        ...s.draft,
        schedule: s.draft.schedule.filter((slot) => slot.id !== id),
      },
    })),

  validateStep: (step) => {
    const target = step ?? get().step;
    const errors = validate(target, get().draft);
    set({ errors });
    return Object.keys(errors).length === 0;
  },

  next: () => {
    if (!get().validateStep()) return false;
    set((s) => ({ step: Math.min(s.step + 1, CREATE_STEPS.length - 1) }));
    return true;
  },

  back: () => set((s) => ({ step: Math.max(s.step - 1, 0), errors: {} })),

  goTo: (step) =>
    set({ step: Math.max(0, Math.min(step, CREATE_STEPS.length - 1)), errors: {} }),

  reset: () => set({ step: 0, draft: EMPTY_DRAFT, errors: {} }),

  toInput: (): CreateEventInput => {
    const d = get().draft;
    return {
      title: d.title.trim(),
      description: d.description.trim(),
      category: d.category,
      startsAt: d.startsAt,
      endsAt: d.endsAt || undefined,
      location: d.isOnline ? 'Online' : d.location.trim(),
      isOnline: d.isOnline,
      // Only carried for in-person events. An online event with coordinates
      // would render a map of a building nobody is going to.
      latitude: d.isOnline ? undefined : d.latitude,
      longitude: d.isOnline ? undefined : d.longitude,
      placeId: d.isOnline ? undefined : d.placeId,
      address: d.isOnline ? undefined : d.address,
      capacity: Number(d.capacity) || 100,
      price: formatPrice(d),
      visibility: d.visibility,
      requiresApproval: d.requiresApproval,
      tokenGated: d.tokenGated,
      gateRequirement: d.tokenGated ? d.gateRequirement.trim() : undefined,
      tags: d.tags,
      coverGradient: d.coverGradient,
      coverImage: d.coverImage,
      communityId: d.communityId,
      schedule: d.schedule.length ? d.schedule : undefined,
    };
  },
}));
