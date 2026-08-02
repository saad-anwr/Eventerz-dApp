/**
 * Form primitives: text field, textarea, switch row and segmented control.
 *
 * All share the same focus treatment as `<SearchBar>` so the Create wizard and
 * Settings feel like one system. Every control clears the 44px touch floor.
 */

import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { View, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { brand } from '@/theme/colors';
import { TOUCH_TARGET, makeShadow, motion, radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';
import { haptics } from '@/utils/haptics';

import { CircleAlert, type LucideIcon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { TextInput } from './text-input';

/* -------------------------------------------------------------------------- */
/*  Text field                                                                 */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  /** Renders a taller multiline box. */
  multiline?: boolean;
  /** Character budget shown under the field. */
  maxLength?: number;
  className?: string;
}

export const TextField = memo(function TextField({
  label,
  error,
  hint,
  icon: Icon,
  multiline = false,
  maxLength,
  value,
  className,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);

  // `focused` is the single source of truth; the shared value follows it in an
  // effect rather than being written from the event handlers. Same result, and
  // the animation can never disagree with the rendered state.
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focus]);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (event) => {
      setFocused(true);
      onFocus?.(event);
    },
    [onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      setFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? 'rgba(248,113,113,0.55)'
      : interpolateColor(
          focus.value,
          [0, 1],
          ['rgba(255,255,255,0.10)', 'rgba(153,69,255,0.55)'],
        ),
  }));

  return (
    <View className={cn('gap-2', className)}>
      {label && (
        <Text variant="label" className="text-muted-foreground">
          {label}
        </Text>
      )}

      <Animated.View
        className="flex-row items-start border bg-white/[0.03] px-4"
        style={[
          {
            borderRadius: radius.xl,
            minHeight: multiline ? 116 : Math.max(52, TOUCH_TARGET),
            paddingVertical: multiline ? 14 : 0,
            alignItems: multiline ? 'flex-start' : 'center',
            gap: 10,
          },
          animatedStyle,
        ]}
      >
        {Icon && (
          <Icon
            size={17}
            color={focused ? brand.purple : '#94a2b8'}
            strokeWidth={2.1}
            style={{ marginTop: multiline ? 2 : 0 }}
          />
        )}
        <TextInput
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          multiline={multiline}
          maxLength={maxLength}
          placeholderTextColor="#64748b"
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.3}
          className="flex-1 text-foreground"
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 15,
            lineHeight: multiline ? 22 : undefined,
            paddingVertical: 0,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 88 : undefined,
          }}
          {...props}
        />
      </Animated.View>

      {(error || hint || maxLength) && (
        <View className="flex-row items-center justify-between gap-3">
          {error ? (
            <View className="flex-1 flex-row items-center gap-1.5">
              <CircleAlert size={12} color="#f87171" strokeWidth={2.4} />
              <Text variant="caption" className="flex-1 text-red-400">
                {error}
              </Text>
            </View>
          ) : (
            <Text
              variant="caption"
              className="flex-1 text-muted-foreground"
              numberOfLines={2}
            >
              {hint ?? ''}
            </Text>
          )}
          {maxLength && (
            <Text variant="caption" className="text-muted-foreground">
              {(value ?? '').length}/{maxLength}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  Switch                                                                     */
/* -------------------------------------------------------------------------- */

export const Switch = memo(function Switch({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Screen-reader label when the switch has no adjacent text. */
  label?: string;
  disabled?: boolean;
}) {
  const progress = useSharedValue(value ? 1 : 0);

  // The thumb follows the `value` prop, so a controlled parent that rejects the
  // change (validation, a failed write) leaves the switch visually correct.
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, motion.spring.snappy);
  }, [value, progress]);

  const toggle = useCallback(() => {
    haptics.selection();
    onValueChange(!value);
  }, [value, onValueChange]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0.12)', brand.purple],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }));

  return (
    <PressableScale
      onPress={toggle}
      disabled={disabled}
      scaleTo={0.92}
      hapticFeedback={false}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={10}
    >
      <Animated.View
        style={[
          { width: 48, height: 28, borderRadius: 14, padding: 3 },
          trackStyle,
        ]}
      >
        <Animated.View
          className="bg-white"
          style={[
            {
              width: 22,
              height: 22,
              borderRadius: 11,
              ...makeShadow('#000000', 0.3, 4, 1),
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </PressableScale>
  );
});

/** Label + description + switch, the standard Settings row. */
export const SwitchRow = memo(function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  icon: Icon,
  disabled,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <View
      className="flex-row items-center gap-3 py-3.5"
      style={{ minHeight: TOUCH_TARGET }}
    >
      {Icon && (
        <View
          className="items-center justify-center bg-white/[0.06]"
          style={{ width: 36, height: 36, borderRadius: radius.md }}
        >
          <Icon size={17} color="#94a2b8" strokeWidth={2} />
        </View>
      )}
      <View className="flex-1">
        <Text variant="title">{title}</Text>
        {description && (
          <Text variant="caption" className="mt-0.5 text-muted-foreground">
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        label={title}
        disabled={disabled}
      />
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*  Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

function SegmentedControlImpl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const indicator = useSharedValue(index);

  // The pill tracks the selected `value`, so it stays correct even when the
  // parent changes tabs without a press (deep link, programmatic navigation).
  useEffect(() => {
    indicator.value = withSpring(index, motion.spring.snappy);
  }, [index, indicator]);

  const segmentWidth = width > 0 ? (width - 8) / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value * segmentWidth }],
    width: segmentWidth,
  }));

  return (
    <View
      className={cn('flex-row border border-white/10 bg-white/[0.04] p-1', className)}
      style={{ borderRadius: radius.full, height: 46 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 && (
        <Animated.View
          className="absolute bg-brand-purple/25 border border-brand-purple/40"
          style={[
            { top: 4, bottom: 4, left: 4, borderRadius: radius.full },
            indicatorStyle,
          ]}
        />
      )}

      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => {
              haptics.selection();
              onChange(option.value);
            }}
            hapticFeedback={false}
            scaleTo={0.97}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              option.count === undefined
                ? option.label
                : `${option.label}, ${option.count}`
            }
            className="flex-1 flex-row items-center justify-center gap-1.5"
          >
            <Text
              style={{
                fontFamily: active ? fontFamily.semibold : fontFamily.medium,
                fontSize: 13,
                color: active ? '#ffffff' : '#94a2b8',
              }}
            >
              {option.label}
            </Text>
            {option.count !== undefined && option.count > 0 && (
              <Text
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 11,
                  color: active ? brand.cyan : '#64748b',
                }}
              >
                {option.count}
              </Text>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * `memo` erases the generic signature, so the memoised component is re-cast to
 * the implementation's type. Without this, `T` collapses to `string` and call
 * sites lose their union narrowing.
 */
export const SegmentedControl = memo(
  SegmentedControlImpl,
) as typeof SegmentedControlImpl;

/* -------------------------------------------------------------------------- */
/*  Field group                                                                */
/* -------------------------------------------------------------------------- */

/** Titled block wrapping a set of related fields or rows. */
export const FieldGroup = memo(function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('gap-3', className)}>
      {title && (
        <View className="gap-1">
          <Text
            variant="label"
            className="uppercase tracking-wider text-muted-foreground"
          >
            {title}
          </Text>
          {description && (
            <Text variant="caption" className="text-muted-foreground">
              {description}
            </Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
});
