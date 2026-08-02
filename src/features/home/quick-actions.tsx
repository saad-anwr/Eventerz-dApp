/**
 * Four-up shortcut grid under the Home header.
 * Wallet-gated actions route through `requireWallet`, so tapping "My Tickets"
 * while signed out connects first and then lands on the right screen.
 */

import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  Plus,
  QrCode,
  Ticket,
  Wallet,
  type LucideIcon,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { accents, type AccentKey } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: AccentKey;
}

const ACTIONS: QuickAction[] = [
  { id: 'create', label: 'Create', icon: Plus, accent: 'purple' },
  { id: 'scan', label: 'Scan QR', icon: QrCode, accent: 'blue' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, accent: 'cyan' },
  { id: 'wallet', label: 'Wallet', icon: Wallet, accent: 'green' },
];

export const QuickActions = memo(function QuickActions({
  onAction,
}: {
  onAction: (id: string) => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(80).duration(420)}
      className="flex-row gap-2.5"
      style={{ paddingHorizontal: screenPadding }}
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const color = accents[action.accent];

        return (
          <PressableScale
            key={action.id}
            onPress={() => onAction(action.id)}
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className="flex-1 items-center border border-white/10 bg-white/[0.035] py-3.5"
            style={{ borderRadius: radius['2xl'] }}
          >
            <View
              className="items-center justify-center"
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.lg,
                backgroundColor: `${color}1c`,
              }}
            >
              <Icon size={18} color={color} strokeWidth={2.2} />
            </View>
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 11,
                marginTop: 7,
                color: '#cbd5e1',
              }}
            >
              {action.label}
            </Text>
          </PressableScale>
        );
      })}
    </Animated.View>
  );
});
