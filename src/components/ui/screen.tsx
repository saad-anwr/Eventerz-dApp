/**
 * Screen scaffold.
 *
 * Owns the things every route needs and nothing else: the brand background,
 * safe-area insets, and bottom padding that clears the tab bar. Screens compose
 * their own scroll container so each can pick FlatList vs ScrollView.
 */

import { memo, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_HEIGHT, screenPadding } from '@/theme/layout';
import { cn } from '@/utils/cn';

import { AuroraBackground } from '../brand/aurora-background';

export interface ScreenProps {
  children: ReactNode;
  /** Apply the top safe-area inset (off when a hero bleeds under the bar). */
  edgeTop?: boolean;
  /** Reserve space for the bottom tab bar. */
  tabBarInset?: boolean;
  /** Horizontal gutter. */
  padded?: boolean;
  /** Ambient gradient wash behind the content. */
  aurora?: boolean;
  className?: string;
  style?: ViewStyle;
}

export const Screen = memo(function Screen({
  children,
  edgeTop = true,
  tabBarInset = false,
  padded = false,
  aurora = true,
  className,
  style,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={cn('flex-1 bg-brand-bg', className)}
      style={[
        {
          paddingTop: edgeTop ? insets.top : 0,
          paddingBottom: tabBarInset ? TAB_BAR_HEIGHT + insets.bottom : 0,
          paddingHorizontal: padded ? screenPadding : 0,
        },
        style,
      ]}
    >
      {aurora && <AuroraBackground />}
      {children}
    </View>
  );
});

/** Bottom padding that keeps the last list item clear of the tab bar. */
export function useListBottomPadding(extra = 24): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + extra;
}
