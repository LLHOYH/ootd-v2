import { StyleSheet, View } from 'react-native';
import {
  Bell,
  Camera,
  Lock,
  Mail,
  MapPin,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react-native';
import { SectionHeader, SettingRow, useTheme } from '@mei/ui';
import type { MyProfile } from '@/lib/hooks/useMyProfile';

export interface SettingsListProps {
  profile: MyProfile;
  onAddFriendsPress?: () => void;
  onSelfiesPress?: () => void;
}

/**
 * Settings list per SPEC §10.11 step 4. All `onPress` handlers are decorative
 * placeholders in v1 — no PATCH /me wiring.
 */
export function SettingsList({
  profile,
  onAddFriendsPress,
  onSelfiesPress,
}: SettingsListProps) {
  const theme = useTheme();
  const noop = () => {};

  // First 3-5 style tags → subtitle preview.
  const stylePreview = profile.stylePreferences.slice(0, 5).join(' · ');
  const climateLabel = profile.climateProfile
    ? profile.climateProfile.charAt(0) + profile.climateProfile.slice(1).toLowerCase()
    : '—';

  return (
    <View style={[styles.wrap, { marginTop: theme.space.lg }]}>
      {/* Personal info */}
      <SectionHeader title="Personal info" />
      <SettingRow
        icon={User}
        title="Name"
        value={profile.displayName}
        onPress={noop}
      />
      <SettingRow
        icon={User}
        title="Gender"
        value={profile.gender ?? '—'}
        onPress={noop}
      />
      <SettingRow
        icon={User}
        title="Birth year"
        value={profile.birthYear != null ? String(profile.birthYear) : '—'}
        onPress={noop}
      />

      {/* Style preferences */}
      <SectionHeader title="Style preferences" />
      <SettingRow
        icon={Sparkles}
        title="Style tags"
        subtitle={stylePreview}
        onPress={noop}
      />

      {/* Climate & location */}
      <SectionHeader title="Climate & location" />
      <SettingRow
        icon={MapPin}
        title="City"
        value={profile.city ?? '—'}
        onPress={noop}
      />
      <SettingRow
        icon={MapPin}
        title="Climate profile"
        value={climateLabel}
        onPress={noop}
      />

      {/* Notifications */}
      <SectionHeader title="Notifications" />
      <SettingRow
        icon={Bell}
        title="Daily Today reminder"
        subtitle="Morning nudge with your outfit"
        onPress={noop}
      />
      <SettingRow
        icon={Bell}
        title="Friend requests"
        onPress={noop}
      />
      <SettingRow
        icon={Bell}
        title="Hangout invites"
        onPress={noop}
      />
      <SettingRow
        icon={Bell}
        title="OOTD reactions"
        onPress={noop}
      />

      {/* Privacy */}
      <SectionHeader title="Privacy" />
      <SettingRow
        icon={Lock}
        title="Discoverable"
        subtitle="Appear in search and what others are wearing"
        value={profile.discoverable ? 'On' : 'Off'}
        onPress={noop}
      />
      <SettingRow
        icon={Lock}
        title="Contribute to community looks"
        value={profile.contributesToCommunityLooks ? 'On' : 'Off'}
        onPress={noop}
      />
      <SettingRow
        icon={Lock}
        title="Profile visibility"
        value={profile.discoverable ? 'Discoverable' : 'Friends only'}
        onPress={noop}
      />

      {/* Selfies */}
      <SectionHeader title="Selfies" />
      <SettingRow
        icon={Camera}
        title="View selfies"
        subtitle={`${profile.counts.selfies} of 5 uploaded`}
        onPress={onSelfiesPress ?? noop}
      />
      <SettingRow
        icon={Camera}
        title="Replace a selfie"
        onPress={onSelfiesPress ?? noop}
      />
      <SettingRow
        icon={Camera}
        title="Delete a selfie"
        onPress={onSelfiesPress ?? noop}
      />

      {/* Add friends */}
      <SectionHeader title="Friends" />
      <SettingRow
        icon={UserPlus}
        title="Add friends"
        subtitle="Search, suggested, contacts"
        onPress={onAddFriendsPress ?? noop}
      />

      {/* Account */}
      <SectionHeader title="Account" />
      <SettingRow
        icon={Mail}
        title="Email"
        value={profile.email}
        onPress={noop}
      />
      <SettingRow
        icon={Lock}
        title="Password"
        value="Change"
        onPress={noop}
      />
      <SettingRow
        icon={User}
        title="Delete account"
        onPress={noop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
