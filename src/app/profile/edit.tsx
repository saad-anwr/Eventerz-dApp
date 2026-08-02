/**
 * Edit profile.
 *
 * Off-chain metadata only - name, handle, bio, location, socials, interests.
 * The wallet address is identity and is deliberately not editable.
 */

import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FieldGroup, TextField } from '@/components/ui/form';
import {
  ArrowLeft,
  Camera,
  Check,
  Link2,
  MapPin,
  Wallet,
} from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { uploadAvatar } from '@/repositories/supabase/avatars';
import { toast } from '@/store/toast-store';
import { useWalletStore } from '@/store/wallet-store';
import { brand } from '@/theme/colors';
import { radius, screenPadding } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { shortenAddress } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useThemeColors } from '@/theme/theme-provider';

const INTERESTS = [
  'DeFi',
  'NFTs',
  'Hackathons',
  'DAOs',
  'Design',
  'Mobile',
  'Rust',
  'Community',
  'Art',
  'Gaming',
  'Infra',
  'AI',
];

export default function EditProfileScreen() {
  const themeColors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const user = useWalletStore((s) => s.user);
  const account = useWalletStore((s) => s.account);
  const updateProfile = useWalletStore((s) => s.updateProfile);

  const [name, setName] = useState(user?.name ?? '');
  const [handle, setHandle] = useState(user?.handle ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [twitter, setTwitter] = useState(user?.twitter ?? '');
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.avatarUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);

  /**
   * Pick and upload a profile picture.
   *
   * Uploaded immediately rather than on Save. The file has to reach storage
   * before `avatar_url` can point at it, and deferring means holding a local
   * `file://` URI in form state that is meaningless to every other client -
   * and that would be written to the row verbatim if the upload later failed.
   */
  const pickAvatar = useCallback(async () => {
    if (uploading || !user) return;
    haptics.light();

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error(
        'Photo access needed',
        'Enable photo permissions to choose a picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Square, because every avatar in the app is rendered in a circle.
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const url = await uploadAvatar(user.id, result.assets[0].uri);
      setAvatarUrl(url);
      // Persist straight away: the picture is already in storage, and leaving
      // the row pointing at the old one until Save would be a picture that
      // exists and is not used.
      await updateProfile({ avatarUrl: url });
      haptics.success();
      toast.success('Picture updated');
    } catch (e) {
      haptics.error();
      toast.error(
        'Could not upload that picture',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setUploading(false);
    }
  }, [uploading, user, updateProfile]);

  const toggleInterest = useCallback((interest: string) => {
    haptics.selection();
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((i) => i !== interest)
        : [...current, interest],
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (name.trim().length < 2) {
      setError('Your name needs at least 2 characters.');
      haptics.warning();
      return;
    }

    setSaving(true);
    await updateProfile({
      name: name.trim(),
      handle: handle.trim().replace(/^@/, '') || user?.handle,
      bio: bio.trim() || undefined,
      location: location.trim() || undefined,
      twitter: twitter.trim().replace(/^@/, '') || undefined,
      interests,
    });
    setSaving(false);

    haptics.success();
    toast.success('Profile updated');
    router.back();
  }, [
    bio,
    handle,
    interests,
    location,
    name,
    router,
    twitter,
    updateProfile,
    user?.handle,
  ]);

  if (!user) {
    router.back();
    return null;
  }

  return (
    <Screen edgeTop={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          <Text variant="h3" className="flex-1" accessibilityRole="header">
            Edit profile
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: screenPadding,
            paddingBottom: 32,
            paddingTop: 12,
          }}
        >
          {/* Avatar */}
          <View className="items-center">
            <PressableScale
              onPress={pickAvatar}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
            >
              <Avatar
                name={name || user.name}
                seed={user.id}
                size="xl"
                ring
                uri={avatarUrl}
              />
              {/* Camera affordance. Without it the avatar is just a picture -
                  nothing says it can be tapped. */}
              <View
                className="absolute bottom-0 right-0 items-center justify-center border-2 border-[#050816]"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: brand.purple,
                }}
              >
                {uploading ? (
                  <Spinner size={14} />
                ) : (
                  <Camera size={15} color="#ffffff" strokeWidth={2.2} />
                )}
              </View>
            </PressableScale>

            <Text variant="caption" className="mt-3 text-muted-foreground">
              {uploading
                ? 'Uploading...'
                : avatarUrl
                  ? 'Tap to change your picture'
                  : 'Tap to add a picture, or keep the one from your wallet'}
            </Text>
          </View>

          {/* Wallet - read only */}
          {account && (
            <View
              className="mt-6 flex-row items-center gap-3 border border-white/10 bg-white/[0.03] p-3.5"
              style={{ borderRadius: radius.xl }}
            >
              <Wallet size={17} color={themeColors.mutedForeground} strokeWidth={2} />
              <View className="flex-1">
                <Text variant="caption" className="text-muted-foreground">
                  Wallet - this is your identity
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 12,
                    color: themeColors.mutedForeground,
                    marginTop: 2,
                  }}
                >
                  {shortenAddress(account.address, 8)}
                </Text>
              </View>
            </View>
          )}

          <View className="mt-6 gap-5">
            <TextField
              label="Display name"
              placeholder="Ana Rojas"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(undefined);
              }}
              error={error}
              maxLength={40}
            />

            <TextField
              label="Handle"
              placeholder="anabuilds"
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              autoCorrect={false}
              hint="Others find you at @your-handle"
              maxLength={20}
            />

            <TextField
              label="Bio"
              placeholder="What do you build? What do you show up for?"
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={180}
            />

            <TextField
              label="Location"
              placeholder="Lisbon, PT"
              value={location}
              onChangeText={setLocation}
              icon={MapPin}
              maxLength={40}
            />

            <TextField
              label="X / Twitter"
              placeholder="anabuilds"
              value={twitter}
              onChangeText={setTwitter}
              icon={Link2}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />

            <FieldGroup
              title="Interests"
              description="We use these to recommend events you'd actually attend."
            >
              <View className="flex-row flex-wrap gap-2">
                {INTERESTS.map((interest) => (
                  <Chip
                    key={interest}
                    label={interest}
                    selected={interests.includes(interest)}
                    onPress={() => toggleInterest(interest)}
                  />
                ))}
              </View>
            </FieldGroup>
          </View>
        </ScrollView>

        {/* Save */}
        <View
          className="border-t border-white/10 pt-4"
          style={{
            paddingHorizontal: screenPadding,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Button
            label="Save changes"
            icon={Check}
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
