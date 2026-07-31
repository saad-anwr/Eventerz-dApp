/**
 * Toast host.
 *
 * Mounted once in the root layout; every `toast.success(...)` call anywhere in
 * the app renders here. Slides in from the top under the status bar so it
 * never collides with the bottom tab bar.
 */

import { memo } from 'react';
import { Platform, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brand, status } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { useToastStore, type ToastVariant } from '@/store/toast-store';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Check, CircleAlert, Info, LoaderCircle, X } from './icon';
import { PressableScale } from './pressable-scale';
import { Spinner } from './spinner';
import { Text } from './text';

const ICONS = {
  success: Check,
  error: CircleAlert,
  info: Info,
  pending: LoaderCircle,
} as const;

const ACCENT: Record<ToastVariant, string> = {
  success: status.success,
  error: status.danger,
  info: brand.cyan,
  pending: brand.purple,
};

/**
 * High enough to beat every other surface in the app.
 *
 * On Android `elevation` decides draw order and overrides `zIndex`. The toast
 * used `makeShadow(..., radius 20, ...)`, and that helper derives elevation as
 * `radius / 3` - so the toast sat at 7 while `shadow.card` is 8 and
 * `shadow.glow` is 9. Any card, and any avatar with a glow, drew *on top of the
 * toast*: the profile avatar and the Edit button punched straight through it,
 * and the message underneath was unreadable.
 *
 * Elevation is set on the container as well as the card - a child cannot lift
 * itself above a sibling of its parent.
 */
const TOAST_ANDROID_ELEVATION = 24;

const TOAST_ELEVATION = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: TOAST_ANDROID_ELEVATION, shadowColor: '#000000' },
  default: { boxShadow: '0px 8px 20px rgba(0,0,0,0.5)' },
});

export const ToastHost = memo(function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      className="absolute left-0 right-0 px-4"
      style={{
        top: insets.top + 8,
        zIndex: 200,
        elevation: TOAST_ANDROID_ELEVATION,
        pointerEvents: 'box-none',
      }}
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.variant];
        const accent = ACCENT[item.variant];

        return (
          <Animated.View
            key={item.id}
            entering={SlideInUp.springify().damping(20)}
            exiting={SlideOutUp.duration(200)}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={
              item.description ? `${item.title}. ${item.description}` : item.title
            }
          >
            <View
              className="flex-row items-center gap-3 border border-white/10 bg-[#0b1024] p-3.5"
              style={{
                borderRadius: radius['2xl'],
                ...TOAST_ELEVATION,
              }}
            >
              <View
                className="items-center justify-center"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.md,
                  backgroundColor: `${accent}1f`,
                }}
              >
                {item.variant === 'pending' ? (
                  <Spinner size={18} />
                ) : (
                  <Icon size={17} color={accent} strokeWidth={2.4} />
                )}
              </View>

              <View className="flex-1">
                <Text variant="title" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.description && (
                  <Text
                    variant="caption"
                    className="mt-0.5 text-muted-foreground"
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                )}
              </View>

              {item.action ? (
                <Button
                  label={item.action.label}
                  onPress={item.action.onPress}
                  variant="ghost"
                  size="sm"
                />
              ) : (
                <PressableScale
                  onPress={() => {
                    haptics.light();
                    dismiss(item.id);
                  }}
                  hapticFeedback={false}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                  className="items-center justify-center rounded-full bg-white/10"
                  style={{ width: 24, height: 24 }}
                >
                  <X size={13} color="#94a2b8" strokeWidth={2.5} />
                </PressableScale>
              )}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
});
