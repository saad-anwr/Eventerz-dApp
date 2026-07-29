/**
 * Search field with a focus glow that mirrors the web app's `.focus-glow`
 * utility — the border warms to brand purple and a soft ring appears.
 */

import { memo, useCallback, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { brand } from '@/theme/colors';
import { TOUCH_TARGET, radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';
import { haptics } from '@/utils/haptics';

import { Search, X, type LucideIcon } from './icon';
import { PressableScale } from './pressable-scale';

export interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  icon?: LucideIcon;
  className?: string;
  /** Rendered to the right of the field, e.g. a Filters button. */
  trailing?: React.ReactNode;
}

export const SearchBar = memo(function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search events, communities, hosts',
  onSubmit,
  autoFocus = false,
  icon: Icon = Search,
  className,
  trailing,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);

  const handleFocus = useCallback(() => {
    setFocused(true);
    focus.value = withTiming(1, { duration: 200 });
  }, [focus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    focus.value = withTiming(0, { duration: 200 });
  }, [focus]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      ['rgba(255,255,255,0.10)', 'rgba(153,69,255,0.60)'],
    ),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      ['rgba(255,255,255,0.04)', 'rgba(153,69,255,0.07)'],
    ),
  }));

  const handleClear = useCallback(() => {
    haptics.light();
    onChangeText('');
  }, [onChangeText]);

  return (
    <View className={cn('flex-row items-center gap-2.5', className)}>
      <Animated.View
        className="flex-1 flex-row items-center border px-4"
        style={[
          { height: 50, borderRadius: radius.full, gap: 10 },
          animatedStyle,
        ]}
      >
        <Icon
          size={17}
          color={focused ? brand.purple : '#94a2b8'}
          strokeWidth={2.2}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor="#64748b"
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={1.3}
          className="flex-1 text-foreground"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 15,
            // Android adds vertical padding to TextInput by default, which
            // pushes the text off-centre inside a fixed-height pill.
            paddingVertical: 0,
          }}
        />
        {value.length > 0 && (
          <PressableScale
            onPress={handleClear}
            hapticFeedback={false}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={12}
            className="items-center justify-center rounded-full bg-white/10"
            style={{ width: 22, height: 22 }}
          >
            <X size={13} color="#94a2b8" strokeWidth={2.5} />
          </PressableScale>
        )}
      </Animated.View>

      {trailing}
    </View>
  );
});

/** Minimum touch height for the trailing slot, exported for callers. */
export const SEARCH_BAR_HEIGHT = Math.max(50, TOUCH_TARGET);
