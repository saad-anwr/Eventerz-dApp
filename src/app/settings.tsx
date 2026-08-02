/**
 * Settings.
 *
 * Theme, language, notifications, wallets, privacy, about, support, logout.
 * Everything writes to `preferencesStore`, which persists to AsyncStorage, so
 * choices survive a relaunch.
 */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
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
  Sparkles,
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
import { useMockBackend } from '@/repositories';
import { getWalletDescriptor, walletAdapterReason } from '@/services/wallet';
import { toast } from '@/store/toast-store';
import {
  LANGUAGES,
  usePreferencesStore,
  type LanguageCode,
} from '@/store/preferences-store';
import { languageFor, searchLanguages } from '@/i18n/languages';
import { translationEnabled } from '@/i18n/translate';
import { useThemeColors } from '@/theme/theme-provider';
import { useAuthStore } from '@/store/auth-store';
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
  /**
   * Omit for a row that only reports something (Version). Such a row then
   * renders as plain content: no press feedback, no chevron, and no
   * `accessibilityRole="button"`.
   *
   * It used to be required, so the Version row passed `() => {}` - which faded
   * on touch and announced itself to a screen reader as a button, both of which
   * promise an action that does not exist.
   */
  onPress?: () => void;
  external?: boolean;
  destructive?: boolean;
}) {
  const tint = destructive ? '#f87171' : '#94a2b8';

  // A chevron is a promise that something happens next; only interactive rows
  // may make it.
  const Container = onPress ? PressableFade : View;
  const interactionProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button' as const,
        accessibilityLabel: title,
        accessibilityHint: description,
      }
    : {};

  return (
    <Container
      {...interactionProps}
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

      {onPress &&
        (external ? (
          <ExternalLink size={15} color="#64748b" strokeWidth={2} />
        ) : (
          <ChevronRight size={16} color="#64748b" strokeWidth={2.2} />
        ))}
    </Container>
  );
}

const Divider = () => <View className="h-px bg-white/[0.06]" />;

/**
 * Read from the config rather than typed in, because a hard-coded string is a
 * lie the moment `app.json` is bumped - and the version people quote in bug
 * reports is the one thing here that has to be true.
 */
const appVersion = Constants.expoConfig?.version ?? '-';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const disconnect = useWalletStore((s) => s.disconnect);

  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const preferences = usePreferencesStore();
  const colors = useThemeColors();

  const [languageQuery, setLanguageQuery] = useState('');
  const activeLanguage = languageFor(preferences.language);
  /* Capped: the full list is long and a settings screen should not become a
     scrolling wall of chips before anyone has typed anything. */
  const languageResults = searchLanguages(languageQuery).slice(0, 24);

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

  /**
   * Delete, then leave.
   *
   * The wallet is disconnected too. The account is gone, so a session still
   * holding its address would show a signed-in shell for a user that no longer
   * exists - which looks like the deletion silently failed.
   *
   * On failure the dialog stays open with the reason. Closing it would leave
   * someone believing their account was deleted when it was not, and that is
   * the one outcome here worth going out of the way to prevent.
   */
  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);

    const failure = await deleteAccount();

    setDeleting(false);
    if (failure) {
      haptics.error();
      setDeleteError(failure);
      return;
    }

    setDeleteVisible(false);
    await disconnect();
    haptics.success();
    toast.success('Account deleted', 'Your personal data has been erased.');
    router.replace('/(tabs)');
  }, [deleteAccount, disconnect, router]);

  const walletDescriptor = account
    ? getWalletDescriptor(account.walletId)
    : undefined;

  // Non-null only when the real Mobile Wallet Adapter is unavailable.
  const walletReason = walletAdapterReason();

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
              <Avatar name={user.name} seed={user.id} size="md" ring uri={user.avatarUrl} />
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
                  System follows your device setting
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row gap-2">
              {(['dark', 'light', 'system'] as const).map((option) => (
                <Chip
                  key={option}
                  label={option[0].toUpperCase() + option.slice(1)}
                  selected={preferences.theme === option}
                  /*
                    Just sets it. This used to also fire a toast admitting that
                    light mode did not exist - the preference was stored and
                    nothing read it. It reads it now, so the apology is gone
                    along with the reason for it.
                  */
                  onPress={() => {
                    haptics.selection();
                    preferences.setTheme(option);
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
                <Text variant="caption" className="mt-0.5 text-muted-foreground">
                  {activeLanguage
                    ? `${activeLanguage.nativeName} · ${activeLanguage.name}`
                    : 'English'}
                </Text>
              </View>
            </View>

            {/*
              A search box rather than a row of chips. Five fitted; forty-six
              would be a wall, and the whole point of the change is that the
              list is no longer short enough to show all of.
            */}
            <TextInput
              value={languageQuery}
              onChangeText={setLanguageQuery}
              placeholder="Search languages"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              autoCapitalize="none"
              className="mt-3 border border-white/10 bg-white/[0.04] px-3.5"
              style={{
                borderRadius: radius.xl,
                height: 44,
                color: colors.foreground,
                fontFamily: fontFamily.regular,
                fontSize: 14,
              }}
            />

            <View className="mt-2.5 flex-row flex-wrap gap-2">
              {languageResults.map((language) => (
                <Chip
                  key={language.code}
                  label={language.nativeName}
                  selected={preferences.language === language.code}
                  onPress={() => {
                    haptics.selection();
                    preferences.setLanguage(language.code);
                  }}
                />
              ))}
              {languageResults.length === 0 && (
                <Text variant="caption" className="text-muted-foreground">
                  No language matches &ldquo;{languageQuery}&rdquo;.
                </Text>
              )}
            </View>

            {/*
              Said plainly. These are machine translations, and someone reading
              an awkward sentence deserves to know why rather than concluding
              the app is badly written in their language.
            */}
            {preferences.language !== 'en' && (
              <Text variant="micro" className="mt-2.5 text-muted-foreground">
                {translationEnabled()
                  ? 'Translated automatically. Wording may be imperfect.'
                  : 'Translation is not configured on this build, so text stays in English.'}
              </Text>
            )}
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
            // Every other row in Settings has a leading icon. Without one this
            // row's text sits where the icons are, so the whole column steps
            // left for a single line and reads as a rendering fault.
            icon={Sparkles}
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
            description="New Eventerz features - rarely, we promise"
            icon={Info}
            value={preferences.notifications.productUpdates}
            onValueChange={() => preferences.toggleNotification('productUpdates')}
          />
        </Group>

        {/* Account - Google is secondary to the wallet, so it sits above the
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

        {/*
          When the demo adapter is standing in, say so and say why. Silently
          pretending a fake wallet is real is how someone ends up believing a
          ticket was minted when nothing touched the chain.
        */}
        {walletReason && (
          <View
            className="mt-3 flex-row items-start gap-2.5 border border-amber-400/25 bg-amber-400/[0.07] p-3.5"
            style={{ borderRadius: radius.lg }}
          >
            <Info size={15} color="#fbbf24" strokeWidth={2.2} />
            <Text variant="caption" className="flex-1 text-muted-foreground">
              {walletReason}
            </Text>
          </View>
        )}

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
          {/* Informational - no onPress, so it renders inert rather than as a
              button that does nothing. */}
          <LinkRow icon={Info} title="Version" value={appVersion} />
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
          {/*
            Only meaningful against the in-memory seed. On the real backend
            there is no "demo data" to restore, and offering the button would
            imply the app can wipe your actual events.
          */}
          {useMockBackend && (
            <>
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
            </>
          )}
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

        {/*
          Account deletion, for anyone signed in with Google.

          Play requires an in-app deletion path for any app that creates
          accounts - a link to the website does not satisfy it. Shown only when
          there is an account to delete: a wallet-only session has no server-side
          record to erase, and offering it there would promise something that
          does not happen.
        */}
        {isLive && profile && (
          <Button
            label="Delete account"
            icon={Trash2}
            variant="danger"
            onPress={() => {
              haptics.warning();
              setDeleteVisible(true);
            }}
            fullWidth
            className="mt-3"
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
        subtitle="Your tickets, badges and reputation stay on-chain - reconnecting restores everything."
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

      {/*
        Spelling out what survives is the point of this dialog, not decoration.
        Hosted events and other people's tickets stay, because deleting them
        would erase a guest's ticket to punish nobody - and someone agreeing to
        "delete everything" deserves to know that before they agree, not after.
      */}
      <Modal
        visible={deleteVisible}
        onClose={() => (deleting ? undefined : setDeleteVisible(false))}
        title="Delete your account?"
        subtitle="Your name, picture, bio, email and wallet link are erased permanently. Events you hosted and other guests' tickets to them remain, along with payment receipts. This cannot be undone."
        dismissOnBackdrop={false}
      >
        {deleteError ? (
          <Text variant="bodySm" className="mb-3 text-red-400">
            {deleteError}
          </Text>
        ) : null}
        <View className="flex-row gap-3">
          <Button
            label="Keep my account"
            variant="secondary"
            onPress={() => setDeleteVisible(false)}
            disabled={deleting}
            className="flex-1"
          />
          <Button
            label="Delete forever"
            variant="danger"
            loading={deleting}
            onPress={handleDeleteAccount}
            className="flex-1"
          />
        </View>
      </Modal>
    </Screen>
  );
}
