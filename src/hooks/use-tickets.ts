import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { integrationsConfig } from '@/constants/config';
import { ticketRepository, userRepository } from '@/repositories';
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
 * Validates the code, marks the ticket used, then attests attendance on-chain.
 */
export function useRedeemTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: string) => {
      // The redemption itself. Once this returns, the guest *is* checked in -
      // `check_in_ticket` has already written the row and bumped the event's
      // counter, and nothing after this point can undo that.
      const ticket = await ticketRepository.redeemQr(payload);

      /*
       * Attest attendance on-chain, against the guest's own wallet - `check_in`
       * writes to their seat PDA, so it needs their address rather than the
       * host's. A guest with no linked wallet has no seat account, which is a
       * normal state and not a failed check-in.
       *
       * # Why this cannot be allowed to throw
       *
       * It used to be awaited bare, so any failure here rejected the whole
       * mutation and the scanner reported "Check-in failed" for a guest the
       * database had already admitted. The operator's only recourse is to scan
       * again, which then says "already checked in" - so a working check-in
       * presented first as an error and then as a duplicate, with the guest
       * standing there either way. RPC timeouts, a rejected wallet prompt and
       * simply being on venue wifi all reach this line, which makes it the
       * likeliest failure at a door rather than an exotic one.
       *
       * The database row is the record the door relies on; the chain write is
       * an attestation on top of it. A failed attestation is worth logging and
       * not worth telling the operator about, because there is nothing they can
       * do at the door and the guest is already through.
       */
      if (integrationsConfig.programId) {
        try {
          const owner = await userRepository.getById(ticket.ownerId);
          if (owner?.walletAddress) {
            await solanaService.checkIn(
              ticket.id,
              ticket.eventId,
              owner.walletAddress,
            );
          }
        } catch (error) {
          console.warn(
            `[check-in] on-chain attestation failed for ticket ${ticket.id}; ` +
              'the guest is checked in and the database row stands.',
            error,
          );
        }
      }

      analytics.track(AnalyticsEvent.TicketCheckedIn, { ticketId: ticket.id });
      return ticket;
    },
    /*
     * Guests and events too, not just tickets. A check-in changes the roster
     * row the host is looking at (`event_guests` carries `checked_in_at`) and
     * the event's `checked_in_count`, so invalidating tickets alone left a host
     * scanning a queue watching a guest list that never moved.
     */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}
