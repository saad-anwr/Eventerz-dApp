/**
 * Custom bottom tab bar.
 *
 * The default bar cannot express the brand: we need a floating glass pill, a
 * gradient indicator that springs between tabs, and a raised gradient "Create"
 * button in the centre. All of it is driven by Reanimated on the UI thread, so
 * switching tabs stays smooth while the destination screen mounts.
 */

import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  Compass,
  Home,
  Plus,
  Ticket,
  User,
  type LucideIcon,
} from '@/navigation/tab-icons';
import { brand, gradients } from '@/theme/colors';
import { TAB_BAR_HEIGHT, motion, shadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { haptics } from '@/utils/haptics';

interface TabDescriptor {
  name: string;
  label: string;
  icon: LucideIcon;
}

/** Route order must match the file order in `app/(tabs)/`. */
const TABS: TabDescriptor[] = [
  { name: 'index', label: 'Home', icon: Home },
  { name: 'discover', label: 'Discover', icon: Compass },
  { name: 'create', label: 'Create', icon: Plus },
  { name: 'tickets', label: 'Tickets', icon: Ticket },
  { name: 'profile', label: 'Profile', icon: User },
];

const CENTER_INDEX = 2;

const TabItem = memo(function TabItem({
  tab,
  focused,
  onPress,
}: {
  tab: TabDescriptor;
  focused: boolean;
  onPress: () => void;
}) {
  const Icon = tab.icon;
  const lift = useSharedValue(focused ? 1 : 0);

  lift.value = withSpring(focused ? 1 : 0, motion.spring.snappy);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 2 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + lift.value * 0.45,
  }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hapticFeedback={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      className="flex-1 items-center justify-center"
      style={{ height: TAB_BAR_HEIGHT }}
    >
      <Animated.View style={iconStyle}>
        <Icon
          size={21}
          color={focused ? brand.cyan : '#7c8aa5'}
          strokeWidth={focused ? 2.4 : 2}
        />
      </Animated.View>
      <Animated.View style={labelStyle}>
        <Text
          style={{
            fontFamily: focused ? fontFamily.semibold : fontFamily.medium,
            fontSize: 10,
            marginTop: 4,
            color: focused ? brand.cyan : '#7c8aa5',
          }}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
});

/** Raised gradient action in the centre slot. */
const CreateButton = memo(function CreateButton({
  focused,
  onPress,
}: {
  focused: boolean;
  onPress: () => void;
}) {
  const rotate = useSharedValue(0);

  rotate.value = withTiming(focused ? 45 : 0, {
    duration: motion.duration.fast,
  });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View className="flex-1 items-center justify-center">
      <PressableScale
        onPress={onPress}
        scaleTo={0.9}
        hapticFeedback={false}
        accessibilityRole="button"
        accessibilityLabel="Create event"
        accessibilityHint="Opens the event creation flow"
        className="items-center justify-center overflow-hidden"
        style={[
          {
            width: 54,
            height: 54,
            borderRadius: 27,
            marginTop: -22,
            borderWidth: 3,
            borderColor: '#050816',
          },
          shadow.glow,
        ]}
      >
        <LinearGradient
          colors={[...gradients.brand.colors]}
          locations={[...gradients.brand.locations]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <Animated.View style={iconStyle}>
          <Plus size={25} color="#ffffff" strokeWidth={2.6} />
        </Animated.View>
      </PressableScale>
    </View>
  );
});

export function EventerzTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const handlePress = useCallback(
    (routeKey: string, routeName: string, isFocused: boolean) => {
      haptics.selection();
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    },
    [navigation],
  );

  return (
    <View
      className="absolute bottom-0 left-0 right-0"
      style={{
        paddingBottom: insets.bottom,
        /*
         * Same reason as the event screen's RSVP bar: on Android `elevation`
         * decides draw order, and a bar with none sits below every card
         * (`shadow.card` is 8), so a long list scrolls straight through it.
         * Above cards, below the toast at 24.
         */
        elevation: 12,
      }}
    >
      {/* Backdrop */}
      <View className="absolute inset-0 overflow-hidden">
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={60}
            tint="dark"
            style={{ position: 'absolute', inset: 0 }}
          />
        ) : (
          <View
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(7,11,28,0.97)' }}
          />
        )}
        <View className="absolute left-0 right-0 top-0 h-px bg-white/10" />
      </View>

      <View
        className="flex-row items-center"
        style={{ height: TAB_BAR_HEIGHT }}
      >
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;

          const isFocused = state.index === index;
          const onPress = () =>
            handlePress(route.key, route.name, isFocused);

          if (index === CENTER_INDEX) {
            return (
              <CreateButton
                key={route.key}
                focused={isFocused}
                onPress={onPress}
              />
            );
          }

          return (
            <TabItem
              key={route.key}
              tab={tab}
              focused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

