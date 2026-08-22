import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { haptics } from '@/utils';

/**
 * Pull-to-refresh handler.
 *
 * Invalidates the given query keys and keeps the spinner up for a minimum beat
 * so the gesture reads as deliberate rather than glitching away instantly.
 */
export function useRefresh(keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.medium();
    try {
      await Promise.all([
        ...keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [keys, queryClient]);

  return { refreshing, onRefresh };
}
