/**
 * Discover filter state.
 *
 * Lives outside React Query on purpose: the filters are the *input* to the
 * query key, so keeping them in a store means the Discover screen can restore
 * its exact state when the user returns from an event detail page.
 */

import { create } from 'zustand';

import type { DateFilter, EventCategory, EventFilters, SortOrder } from '@/types';

export const DEFAULT_FILTERS: EventFilters = {
  query: '',
  categories: [],
  date: 'any',
  location: null,
  onlineOnly: false,
  freeOnly: false,
  sort: 'soonest',
};

interface DiscoverState {
  filters: EventFilters;
  setQuery: (query: string) => void;
  toggleCategory: (category: EventCategory) => void;
  setDate: (date: DateFilter) => void;
  setLocation: (location: string | null) => void;
  setSort: (sort: SortOrder) => void;
  toggleOnlineOnly: () => void;
  toggleFreeOnly: () => void;
  reset: () => void;
  /** Count of non-default filters — drives the badge on the Filters button. */
  activeCount: () => number;
}

export const useDiscoverStore = create<DiscoverState>()((set, get) => ({
  filters: DEFAULT_FILTERS,

  setQuery: (query) => set({ filters: { ...get().filters, query } }),

  toggleCategory: (category) => {
    const { categories } = get().filters;
    const next = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category];
    set({ filters: { ...get().filters, categories: next } });
  },

  setDate: (date) => set({ filters: { ...get().filters, date } }),
  setLocation: (location) => set({ filters: { ...get().filters, location } }),
  setSort: (sort) => set({ filters: { ...get().filters, sort } }),

  toggleOnlineOnly: () =>
    set({
      filters: { ...get().filters, onlineOnly: !get().filters.onlineOnly },
    }),

  toggleFreeOnly: () =>
    set({ filters: { ...get().filters, freeOnly: !get().filters.freeOnly } }),

  reset: () => set({ filters: DEFAULT_FILTERS }),

  activeCount: () => {
    const f = get().filters;
    let count = 0;
    if (f.categories.length) count += f.categories.length;
    if (f.date !== 'any') count += 1;
    if (f.location) count += 1;
    if (f.onlineOnly) count += 1;
    if (f.freeOnly) count += 1;
    if (f.sort !== 'soonest') count += 1;
    return count;
  },
}));
