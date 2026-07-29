/**
 * Settings.
 *
 * Theme, language, notifications, wallets, privacy, about, support, logout.
 * Everything writes to `preferencesStore`, which persists to AsyncStorage, so
 * choices survive a relaunch.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SwitchRow } from '@/components/ui/form';
import { GlassCard } from '@/components/ui/glass-card';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Link2,
  LogOut,
  Moon,
  RotateCcw,
  Shield,
  Smartphone,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { PressableFade } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { GoogleAccountRow } from '@/features/wallet';
import { integrationsConfig, siteConfig } from '@/constants/config';
import { resetMockDatabase } from '@/mock';
import { getWalletDescriptor } from '@/services/wallet';
import { toast } from '@/store/toast-store';
import {
  LANGUAGES,
  usePreferencesStore,
  type LanguageCode,
} from '@/store/preferences-store';
import { useWalletStore } from '@/store/wallet-store';
import { TOUCH_TARGET, radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-7">
      <Text
        variant="label"
        className="mb-3 uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </Text>
      <View
        className="border border-white/10 bg-white/[0.03] px-4"
        style={{ borderRadius: radius['2xl'] }}
      >
        {children}
      </View>
    </View>
  );
}

function LinkRow({
  icon: Icon,
  title,
  description,
  value,
  onPress,
  external = false,
  destructive = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  value?: string;
  onPress: () => void;
  external?: boolean;
  destructive?: boolean;
}) {
  const tint = destructive ? '#f87171' : '#94a2b8';

  return (
    <PressableFade
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      className="flex-row items-center gap-3 py-3.5"
      style={{ minHeight: TOUCH_TARGET }}
    >
      <View
        className="items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: destructive
            ? 'rgba(248,113,113,0.12)'
            : 'rgba(255,255,255,0.06)',
        }}
      >
        <Icon size={17} color={tint} strokeWidth={2} />
      </View>

      <View className="flex-1">
        <Text
          variant="title"
          style={destructive ? { color: '#f87171' } : undefined}
        >
          {title}
        </Text>
        {description && (
          <Text variant="caption" className="mt-0.5 text-muted-foreground">
            {description}
          </Text>
        )}
      </View>

      {value && (
        <Text variant="bodySm" className="text-muted-foreground">
          {value}
        </Text>
      )}

      {external ? (
        <ExternalLink size={15} color="#64748b" strokeWidth={2} />
      ) : (
        <ChevronRight size={16} color="#64748b" strokeWidth={2.2} />
      )}
    </PressableFade>
  );
}

const Divider = () => <View className="h-px bg-white/[0.06]" />;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [signOutVisible, setSignOutVisible] = useState(false);

  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const disconnect = useWalletStore((s) => s.disconnect);

  const preferences = usePreferencesStore();

  const openLink = useCallback((url: string) => {
    haptics.light();
    Linking.openURL(url).catch(() =>
      toast.error('Could not open link', 'No browser is available.'),
    );
  }, []);

  const handleSignOut = useCallback(async () => {
    setSignOutVisible(false);
    await disconnect();
    haptics.success();
    toast.info('Wallet disconnected', 'Your data stays on-chain.');
    router.replace('/(tabs)');
  }, [disconnect, router]);

  const walletDescriptor = account
    ? getWalletDescriptor(account.walletId)
    : undefined;

  return (
    <Screen edgeTop={false}>
      {/* Header */}
      <View
        className="flex-row items-center gap-3"
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: screenPadding,
          paddingBottom: 8,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
          size={40}
          iconSize={18}
        />
        <Text variant="h3" accessibilityRole="header">
          Settings
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenPadding,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* Account */}
        {user && account ? (
          <GlassCard className="mt-3 p-4" radius={radius['2xl']}>
            <View className="flex-row items-center gap-3">
              <Avatar name={user.name} seed={user.id} size="md" ring />
              <View className="flex-1">
                <Text variant="title" numberOfLines={1}>
                  {user.name}
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 11,
                    color: '#94a2b8',
                    marginTop: 2,
                  }}
                >
                  {shortenAddress(account.address, 6)}
                </Text>
              </View>
              <Badge
                label={walletDescriptor?.name ?? 'Wallet'}
                variant="green"
                size="sm"
              />
            </View>
          </GlassCard>
        ) : (
          <View
            className="mt-3 flex-row items-center gap-3 border border-white/10 bg-white/[0.03] p-4"
            style={{ borderRadius: radius['2xl'] }}
          >
            <Wallet size={18} color="#94a2b8" strokeWidth={2} />
            <Text variant="bodySm" className="flex-1 text-muted-foreground">
              No wallet connected
            </Text>
          </View>
        )}

        {/* Appearance */}
        <Group title="Appearance">
          <View className="py-3.5">
            <View className="flex-row items-center gap-3">
              <View
                className="items-center justify-center bg-white/[0.06]"
                style={{ width: 36, height: 36, borderRadius: radius.md }}
              >
                <Moon size={17} color="#94a2b8" strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text variant="title">Theme</Text>
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  Eventerz is dark-first — light mode is on the roadmap
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row gap-2">
              {(['dark', 'light', 'system'] as const).map((option) => (
                <Chip
                  key={option}
                  label={option[0].toUpperCase() + option.slice(1)}
                  selected={preferences.theme === option}
                  onPress={() => {
                    preferences.setTheme(option);
                    if (option !== 'dark') {
                      toast.info(
                        'Dark mode only for now',
                        'Your choice is saved and applies when light lands.',
                      );
                    }
                  }}
                />
              ))}
            </View>
          </View>

          <Divider />

          <View className="py-3.5">
            <View className="flex-row items-center gap-3">
              <View
                className="items-center justify-center bg-white/[0.06]"
                style={{ width: 36, height: 36, borderRadius: radius.md }}
              >
                <Globe size={17} color="#94a2b8" strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text variant="title">Language</Text>
              </View>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {LANGUAGES.map((language) => (
                <Chip
                  key={language.code}
                  label={language.label}
                  selected={preferences.language === language.code}
                  onPress={() =>
                    preferences.setLanguage(language.code as LanguageCode)
                  }
                />
              ))}
            </View>
          </View>

          <Divider />

          <SwitchRow
            title="Haptic feedback"
            description="Subtle taps on presses and confirmations"
            icon={Smartphone}
            value={preferences.hapticsEnabled}
            onValueChange={preferences.setHaptics}
          />

          <Divider />

          <SwitchRow
            title="Reduce motion"
            description="Minimise decorative animation across the app"
            value={preferences.reduceMotion}
            onValueChange={preferences.setReduceMotion}
          />
        </Group>

        {/* Notifications */}
        <Group title="Notifications">
          <SwitchRow
            title="Event reminders"
            description="24 hours and 1 hour before events you're attending"
            icon={Bell}
            value={preferences.notifications.eventReminders}
            onValueChange={() => preferences.toggleNotification('eventReminders')}
          />
          <Divider />
          <SwitchRow
            title="Wallet updates"
            description="Ticket mints, transfers and check-ins"
            icon={Wallet}
            value={preferences.notifications.walletUpdates}
            onValueChange={() => preferences.toggleNotification('walletUpdates')}
          />
          <Divider />
          <SwitchRow
            title="Community announcements"
            description="Posts from communities you've joined"
            icon={Users}
            value={preferences.notifications.communityAnnouncements}
            onValueChange={() =>
              preferences.toggleNotification('communityAnnouncements')
            }
          />
          <Divider />
          <SwitchRow
            title="Product updates"
            description="New Eventerz features — rarely, we promise"
            icon={Info}
            value={preferences.notifications.productUpdates}
            onValueChange={() => preferences.toggleNotification('productUpdates')}
          />
        </Group>

        {/* Account — Google is secondary to the wallet, so it sits above the
            wallet group as "how you get back in", not "how you sign in". */}
        <Group title="Account recovery">
          <GoogleAccountRow />
        </Group>

        {/* Wallets */}
        <Group title="Wallets">
          <LinkRow
            icon={Wallet}
            title="Connected wallet"
            description={
              account
                ? `${walletDescriptor?.name} on ${account.cluster}`
                : 'Nothing connected'
            }
            onPress={() =>
              toast.info(
                'One wallet at a time',
                'Multi-wallet support is coming with the native build.',
              )
            }
          />
          <Divider />
          <LinkRow
            icon={Globe}
            title="Network"
            value={integrationsConfig.solanaNetwork}
            description="Set with EXPO_PUBLIC_SOLANA_NETWORK"
            onPress={() =>
              toast.info(
                'Configured via environment',
                'See .env.example in the project root.',
              )
            }
          />
        </Group>

        {/* Privacy */}
        <Group title="Privacy">
          <SwitchRow
            title="Show wallet on profile"
            description="Others can see your address on your public profile"
            icon={Eye}
            value={preferences.privacy.showWalletOnProfile}
            onValueChange={() => preferences.togglePrivacy('showWalletOnProfile')}
          />
          <Divider />
          <SwitchRow
            title="Discoverable"
            description="Appear in search and attendee lists"
            icon={Users}
            value={preferences.privacy.discoverable}
            onValueChange={() => preferences.togglePrivacy('discoverable')}
          />
          <Divider />
          <SwitchRow
            title="Share attendance"
            description="Let communities see events you've attended"
            icon={Shield}
            value={preferences.privacy.shareAttendance}
            onValueChange={() => preferences.togglePrivacy('shareAttendance')}
          />
        </Group>

        {/* About */}
        <Group title="About">
          <LinkRow
            icon={Info}
            title="About Eventerz"
            description={siteConfig.tagline}
            onPress={() => openLink(siteConfig.url)}
            external
          />
          <Divider />
          <LinkRow
            icon={Link2}
            title="Source code"
            onPress={() => openLink(siteConfig.links.github)}
            external
          />
          <Divider />
          <LinkRow
            icon={CircleHelp}
            title="Support"
            description="Questions, bugs, feature requests"
            onPress={() => openLink(siteConfig.links.discord)}
            external
          />
          <Divider />
          <LinkRow
            icon={Info}
            title="Version"
            value="1.0.0"
            onPress={() => {}}
          />
        </Group>

        {/* Developer */}
        <Group title="Developer">
          <LinkRow
            icon={RotateCcw}
            title="Replay onboarding"
            description="Show the intro screens again on next launch"
            onPress={() => {
              preferences.resetOnboarding();
              haptics.success();
              toast.success('Onboarding reset', 'It shows on your next launch.');
            }}
          />
          <Divider />
          <LinkRow
            icon={Trash2}
            title="Reset demo data"
            description="Restore the seeded events, tickets and notifications"
            onPress={() => {
              resetMockDatabase();
              haptics.success();
              toast.success('Demo data restored');
            }}
          />
        </Group>

        {/* Sign out */}
        {account && (
          <Button
            label="Disconnect wallet"
            icon={LogOut}
            variant="danger"
            onPress={() => {
              haptics.warning();
              setSignOutVisible(true);
            }}
            fullWidth
            className="mt-8"
          />
        )}

        <Text
          variant="micro"
          className="mt-7 text-center text-muted-foreground"
        >
          {siteConfig.name} · Built on Solana{'\n'}
          {siteConfig.tagline}
        </Text>
      </ScrollView>

      <Modal
        visible={signOutVisible}
        onClose={() => setSignOutVisible(false)}
        title="Disconnect wallet?"
        subtitle="Your tickets, badges and reputation stay on-chain — reconnecting restores everything."
        dismissOnBackdrop={false}
      >
        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setSignOutVisible(false)}
            className="flex-1"
          />
          <Button
            label="Disconnect"
            variant="danger"
            onPress={handleSignOut}
            className="flex-1"
          />
        </View>
      </Modal>
    </Screen>
  );
}
