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
  price: string;
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
  price: 'Free',
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
    if (!draft.isFree && !/\d/.test(draft.price)) {
      errors.price = 'Enter a price, e.g. "0.5 SOL".';
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
      price: d.isFree ? 'Free' : d.price.trim(),
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
