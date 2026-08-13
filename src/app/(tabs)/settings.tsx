/**
 * Settings.
 *
 * Language, notifications, wallets, privacy, about, support, logout.
 * Everything writes to `preferencesStore`, which persists to AsyncStorage, so
 * choices survive a relaunch.
 */

import Constants from 'expo-constants';
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
  FileText,
  Globe,
  Info,
  Link2,
  LogOut,
  RotateCcw,
  Shield,
  ShieldCheck,
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
import { TextInput } from '@/components/ui/text-input';
import {
  ConnectWalletSheet,
  GoogleAccountRow,
  LinkedWallets,
  useConnectWallet,
} from '@/features/wallet';
import { integrationsConfig, siteConfig } from '@/constants/config';
import { resetMockDatabase } from '@/mock';
import { useMockBackend } from '@/repositories';
import { getWalletDescriptor, walletAdapterReason } from '@/services/wallet';
import { toast } from '@/store/toast-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { languageFor, searchLanguages } from '@/i18n/languages';
import { useQuotaExhausted } from '@/i18n/use-translation';

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
          <ExternalLink size={15} color={'#94a2b8'} strokeWidth={2} />
        ) : (
          <ChevronRight size={16} color={'#94a2b8'} strokeWidth={2.2} />
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
  const [googleSignOutVisible, setGoogleSignOutVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Hosts the connect sheet that `LinkedWallets` opens to add a wallet.
  const { sheetVisible, openSheet, closeSheet, handleConnected } =
    useConnectWallet();

  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const disconnect = useWalletStore((s) => s.disconnect);

  const isLive = useAuthStore((s) => s.isLive);
  const profile = useAuthStore((s) => s.profile);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const signOutGoogle = useAuthStore((s) => s.signOut);

  const preferences = usePreferencesStore();

  const [languageQuery, setLanguageQuery] = useState('');
  const activeLanguage = languageFor(preferences.language);
  const outOfTranslationQuota = useQuotaExhausted();
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
   * Sign out of the Google account.
   *
   * There was no way to do this. "Disconnect wallet" renders only when a wallet
   * is connected, so somebody who signed in with Google alone - the path this
   * app now recommends to anyone without a wallet - had a Settings screen whose
   * only account action was *delete*. Leaving and destroying were the same
   * button.
   *
   * The wallet is disconnected alongside it when one is present: the Google
   * account is the root identity (0022) and the wallet hangs off it, so keeping
   * a wallet session attached to an account nobody is signed into any more is a
   * half-signed-in state with no way to name it.
   */
  const handleSignOutGoogle = useCallback(async () => {
    setGoogleSignOutVisible(false);
    await signOutGoogle();
    if (account) await disconnect();
    haptics.success();
    toast.info('Signed out', 'Your events, tickets and reputation are safe.');
    router.replace('/(tabs)');
  }, [signOutGoogle, account, disconnect, router]);

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
            <Wallet size={18} color={'#94a2b8'} strokeWidth={2} />
            <Text variant="bodySm" className="flex-1 text-muted-foreground">
              No wallet connected
            </Text>
          </View>
        )}

        {/*
          Every wallet on the account, not just the one connected right now.
          Renders nothing when signed out - wallets attach to an account, so
          there is no set to show without one.
        */}
        <Group title="Linked wallets">
          <View className="pt-1 pb-2">
            <LinkedWallets onLink={openSheet} />
          </View>
        </Group>

        {/*
          Appearance.

          No theme control. Eventerz is dark-only by design - the palette, the
          gradients and the glass surfaces are all built against a near-black
          page - and the toggle that used to live here saved a preference
          nothing honoured, which is a worse answer than not offering one.
        */}
        <Group title="Appearance">
          <View className="py-3.5">
            <View className="flex-row items-center gap-3">
              <View
                className="items-center justify-center bg-white/[0.06]"
                style={{ width: 36, height: 36, borderRadius: radius.md }}
              >
                <Globe size={17} color={'#94a2b8'} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text variant="title">Language</Text>
                <Text
                  variant="caption"
                  className="mt-0.5 text-muted-foreground"
                  noTranslate
                >
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
              placeholderTextColor={'#94a2b8'}
              autoCorrect={false}
              autoCapitalize="none"
              className="mt-3 border border-white/10 bg-white/[0.04] px-3.5"
              style={{
                borderRadius: radius.xl,
                height: 44,
                color: '#f8fafc',
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
                {outOfTranslationQuota
                  ? 'The free translation quota for today is used up, so text stays in English.'
                  : 'Translated automatically. Wording may be imperfect.'}
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
                'This is the wallet you are signing with',
                'Add or switch wallets under Linked wallets above.',
              )
            }
          />
          <Divider />
          <LinkRow
            icon={Globe}
            title="Network"
            value={integrationsConfig.solanaNetwork}
            description="Where your tickets and payments settle"
            onPress={() =>
              toast.info(
                'Solana network',
                `Eventerz settles seats, tickets and payments on ${integrationsConfig.solanaNetwork}.`,
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

        {/*
          Legal.

          Its own group rather than two more rows under About, because these are
          the documents a store review looks for and burying them among source
          and support links is how they get missed. Both open the live pages on
          the website - the same URLs given to the Solana dApp Store listing, so
          there is one copy to keep current instead of a second one embedded in
          the binary that goes stale at the next release.
        */}
        <Group title="Legal">
          <LinkRow
            icon={FileText}
            title="Terms of Use"
            description="The rules for hosting, attending, and moving funds"
            onPress={() => openLink(siteConfig.links.terms)}
            external
          />
          <Divider />
          <LinkRow
            icon={ShieldCheck}
            title="Privacy Policy"
            description="What we collect, who sees it, and how to delete it"
            onPress={() => openLink(siteConfig.links.privacy)}
            external
          />
        </Group>

        {/*
          Titled for the person using the app, not for us.

          This was "Developer", with a row called "Replay onboarding" - words
          that describe who built the feature rather than what it does. Replaying
          the intro is an ordinary thing a real user might want, and filing it
          under "Developer" both hides it from them and makes a shipped app look
          like a work in progress.
        */}
        <Group title="Help">
          <LinkRow
            icon={RotateCcw}
            title="Show the intro again"
            description="Replays the welcome screens on your next launch"
            onPress={() => {
              preferences.resetOnboarding();
              haptics.success();
              toast.success('Intro reset', 'It shows on your next launch.');
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
        {/*
          Sign out, above Delete account and visually quieter than it.

          Order and weight both matter here: leaving is the common action and
          deleting is the irreversible one, so the reversible thing comes first
          and only the destructive one is styled as destructive.
        */}
        {isLive && profile && (
          <Button
            label="Sign out"
            icon={LogOut}
            variant="secondary"
            onPress={() => {
              haptics.warning();
              setGoogleSignOutVisible(true);
            }}
            fullWidth
            className={account ? 'mt-3' : 'mt-8'}
          />
        )}

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
        Signing out is reversible, and the dialog says so plainly. The delete
        dialog below deliberately reads nothing like this one - the two used to
        be one button, and the whole point of separating them is that a person
        can tell at a glance which one they are about to press.
      */}
      <Modal
        visible={googleSignOutVisible}
        onClose={() => setGoogleSignOutVisible(false)}
        title="Sign out?"
        subtitle={
          account
            ? 'Your wallet is disconnected too. Nothing is deleted - sign back in any time to pick up where you left off.'
            : 'Nothing is deleted. Sign back in any time to pick up where you left off.'
        }
      >
        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setGoogleSignOutVisible(false)}
            className="flex-1"
          />
          <Button
            label="Sign out"
            onPress={handleSignOutGoogle}
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

      {/*
        Linking a wallet reuses the connect sheet rather than having its own
        flow. Choosing a wallet there connects it, and `useLinkGoogleWallet`
        then issues the challenge and posts the signature - so there is exactly
        one path to a linked wallet, and it always includes the proof.
      */}
      <ConnectWalletSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onConnected={handleConnected}
      />
    </Screen>
  );
}
