/**
 * Toast queue.
 *
 * A store rather than context so any layer - including services and mutation
 * callbacks - can raise a toast without a hook or a provider in scope.
 */

import { create } from 'zustand';

import { uid } from '@/utils';

export type ToastVariant = 'success' | 'error' | 'info' | 'pending';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Milliseconds on screen; `pending` toasts stay until dismissed. */
  duration: number;
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION = 3200;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  show: ({ duration, ...toast }) => {
    const id = uid('toast');
    const resolved =
      duration ?? (toast.variant === 'pending' ? 0 : DEFAULT_DURATION);
    // Only ever show one at a time - stacked toasts on a phone are noise.
    set({ toasts: [{ ...toast, id, duration: resolved }] });
    if (resolved > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, resolved);
    }
    return id;
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers so call sites read as one line. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().show({ variant: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().show({ variant: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().show({ variant: 'info', title, description }),
  pending: (title: string, description?: string) =>
    useToastStore.getState().show({ variant: 'pending', title, description }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};
