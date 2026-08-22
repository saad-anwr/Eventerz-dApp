import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { brand } from '@/theme/colors';
import { haptics } from '@/utils';

/**
 * Pull-to-refresh handler.
 *
 * Invalidates the given query keys and keeps the spinner up for a minimum beat
 * so the gesture reads as deliberate rather than glitching away instantly.
 *
 * `control` is the styled `<RefreshControl>` to hand straight to a scroller.
 * Eight screens each carried a byte-identical copy of it; the brand tint now
 * lives here so a screen cannot forget it.
 */
export function useRefresh(
  keys: readonly (readonly unknown[])[],
  /** Second stop of the Android spinner sweep. */
  accent: string = brand.cyan,
) {
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

  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={brand.purple}
      colors={[brand.purple, accent]}
      progressBackgroundColor="#0b1024"
    />
  );

  return { refreshing, onRefresh, control };
}
