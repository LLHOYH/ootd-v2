import { StyleSheet, View } from 'react-native';
import {
  Bell,
  Camera,
  Lock,
  LogOut,
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
  onSignOutPress?: () => void;
}

/**
 * Settings list per SPEC §10.11 step 4. Rows only receive `onPress` when
 * that action is actually wired.
 */
export function SettingsList({
  profile,
  onAddFriendsPress,
  onSelfiesPress,
  onSignOutPress,
}: SettingsListProps) {
  const theme = useTheme();

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
      />
      <SettingRow
        icon={User}
        title="Gender"
        value={profile.gender ?? '—'}
      />
      <SettingRow
        icon={User}
        title="Birth year"
        value={profile.birthYear != null ? String(profile.birthYear) : '—'}
      />

      {/* Style preferences */}
      <SectionHeader title="Style preferences" />
      <SettingRow
        icon={Sparkles}
        title="Style tags"
        subtitle={stylePreview}
      />

      {/* Climate & location */}
      <SectionHeader title="Climate & location" />
      <SettingRow
        icon={MapPin}
        title="City"
        value={profile.city ?? '—'}
      />
      <SettingRow
        icon={MapPin}
        title="Climate profile"
        value={climateLabel}
      />

      {/* Notifications */}
      <SectionHeader title="Notifications" />
      <SettingRow
        icon={Bell}
        title="Daily Today reminder"
        subtitle="Morning nudge with your outfit"
      />
      <SettingRow
        icon={Bell}
        title="Friend requests"
      />
      <SettingRow
        icon={Bell}
        title="Hangout invites"
      />
      <SettingRow
        icon={Bell}
        title="OOTD reactions"
      />

      {/* Privacy */}
      <SectionHeader title="Privacy" />
      <SettingRow
        icon={Lock}
        title="Discoverable"
        subtitle="Appear in search and what others are wearing"
        value={profile.discoverable ? 'On' : 'Off'}
      />
      <SettingRow
        icon={Lock}
        title="Contribute to community looks"
        value={profile.contributesToCommunityLooks ? 'On' : 'Off'}
      />
      <SettingRow
        icon={Lock}
        title="Profile visibility"
        value={profile.discoverable ? 'Discoverable' : 'Friends only'}
      />

      {/* Selfies */}
      <SectionHeader title="Selfies" />
      <SettingRow
        icon={Camera}
        title="View selfies"
        subtitle={`${profile.counts.selfies} of 5 uploaded`}
        onPress={onSelfiesPress}
      />
      <SettingRow
        icon={Camera}
        title="Replace a selfie"
        onPress={onSelfiesPress}
      />
      <SettingRow
        icon={Camera}
        title="Delete a selfie"
        onPress={onSelfiesPress}
      />

      {/* Add friends */}
      <SectionHeader title="Friends" />
      <SettingRow
        icon={UserPlus}
        title="Add friends"
        subtitle="Search, suggested, contacts"
        onPress={onAddFriendsPress}
      />

      {/* Account */}
      <SectionHeader title="Account" />
      <SettingRow
        icon={Mail}
        title="Email"
        value={profile.email}
      />
      <SettingRow
        icon={Lock}
        title="Password"
        value="Change"
      />
      <SettingRow
        icon={LogOut}
        title="Sign out"
        onPress={onSignOutPress}
      />
      <SettingRow
        icon={User}
        title="Delete account"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
