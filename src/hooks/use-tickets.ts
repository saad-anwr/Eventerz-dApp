import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ticketRepository } from '@/repositories';
import { AnalyticsEvent, analytics, solanaService } from '@/services';
import { useWalletStore } from '@/store/wallet-store';

import { queryKeys } from './query-keys';

export function useMyTickets() {
  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);

  return useQuery({
    queryKey: queryKeys.tickets.byOwner(user?.id ?? ''),
    queryFn: () => ticketRepository.listByOwner(user!.id, account!.address),
    enabled: Boolean(user && account),
    staleTime: 30_000,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(id ?? ''),
    queryFn: () => ticketRepository.getById(id!),
    enabled: Boolean(id),
  });
}

export function useTicketForEvent(eventId: string | undefined) {
  const user = useWalletStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.tickets.forEvent(eventId ?? '', user?.id ?? ''),
    queryFn: () => ticketRepository.getByEvent(eventId!, user!.id),
    enabled: Boolean(eventId && user),
  });
}

export function useMyBadges() {
  const user = useWalletStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.tickets.badges(user?.id ?? ''),
    queryFn: () => ticketRepository.listBadges(user!.id),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
}

/**
 * Redeem a scanned QR payload.
 *
 * Validates the code, writes the check-in on-chain, then marks the ticket used.
 */
export function useRedeemTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: string) => {
      const ticket = await ticketRepository.redeemQr(payload);
      await solanaService.checkIn(ticket.id, ticket.eventId);
      analytics.track(AnalyticsEvent.TicketCheckedIn, { ticketId: ticket.id });
      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    },
  });
}
