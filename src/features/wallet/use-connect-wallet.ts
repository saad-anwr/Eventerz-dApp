/**
 * Wallet-gating hook.
 *
 * `requireWallet(action)` runs `action` when a wallet is connected, and opens
 * the connect sheet otherwise - remembering the action so it fires the moment
 * the connection succeeds. That way "RSVP" from a signed-out state connects and
 * RSVPs in one gesture rather than making the user tap twice.
 */

import { useCallback, useRef, useState } from 'react';

import { useWalletStore } from '@/store/wallet-store';

export function useConnectWallet() {
  const isConnected = useWalletStore((s) => s.status === 'connected');
  const [sheetVisible, setSheetVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const requireWallet = useCallback(
    (action: () => void) => {
      if (isConnected) {
        action();
        return;
      }
      pendingAction.current = action;
      setSheetVisible(true);
    },
    [isConnected],
  );

  const openSheet = useCallback(() => {
    pendingAction.current = null;
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    pendingAction.current = null;
    setSheetVisible(false);
  }, []);

  const handleConnected = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    // Let the sheet's dismissal animation start before the action navigates.
    if (action) setTimeout(action, 260);
  }, []);

  return {
    isConnected,
    sheetVisible,
    requireWallet,
    openSheet,
    closeSheet,
    handleConnected,
  };
}
