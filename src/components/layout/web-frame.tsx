/**
 * Phone frame for the web target.
 *
 * Eventerz is a mobile app; React Native Web happily stretches it to whatever
 * the browser window is, which makes fixed-height heroes and absolutely
 * positioned bars look broken. On web we constrain the app to a phone-sized
 * column and centre it. On native this is a passthrough - zero cost, no extra
 * view in the tree.
 */

import { memo, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

/** Roughly a large phone - wide enough for the tab bar, narrow enough to read. */
const FRAME_WIDTH = 430;

export const WebFrame = memo(function WebFrame({
  children,
}: {
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') return <>{children}</>;

  // On a narrow browser (or a real phone browser) fill the viewport instead of
  // pillarboxing a window that is already the right size.
  const framed = width > FRAME_WIDTH + 40;

  if (!framed) return <>{children}</>;

  return (
    <View className="flex-1 items-center bg-black">
      <View
        className="flex-1 overflow-hidden bg-brand-bg"
        style={{
          width: FRAME_WIDTH,
          maxWidth: '100%',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {children}
      </View>
    </View>
  );
});
