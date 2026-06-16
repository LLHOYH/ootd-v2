import { StyleSheet, View } from 'react-native';
import {
  Camera,
  Lock,
  MapPin,
  Sparkles,
  User,
} from 'lucide-react-native';
import { SettingRow, useTheme } from '@mei/ui';
import type { MyProfile } from '@/lib/hooks/useMyProfile';

export interface SettingsListProps {
  profile: MyProfile;
  onEditProfilePress?: () => void;
  onSelfiesPress?: () => void;
}

/**
 * Settings list per SPEC §10.11 step 4. Rows only receive `onPress` when
 * that action is actually wired.
 */
export function SettingsList({
  profile,
  onEditProfilePress,
  onSelfiesPress,
}: SettingsListProps) {
  const theme = useTheme();

  const stylePreview = profile.stylePreferences.slice(0, 3).join(' · ');
  const climateLabel = profile.climateProfile
    ? profile.climateProfile.charAt(0) + profile.climateProfile.slice(1).toLowerCase()
    : 'Not set';
  const locationPreview = [profile.city, climateLabel].filter(Boolean).join(' · ');

  return (
    <View style={[styles.wrap, { gap: theme.space.sm, marginTop: theme.space.lg }]}>
      <SettingRow
        icon={User}
        title="Personal info"
        subtitle={`${profile.displayName} · @${profile.username}`}
        onPress={onEditProfilePress}
      />
      <SettingRow
        icon={Sparkles}
        title="Style preferences"
        subtitle={stylePreview || 'Add style tags'}
        onPress={onEditProfilePress}
      />
      <SettingRow
        icon={MapPin}
        title="Location and weather"
        subtitle={locationPreview}
        onPress={onEditProfilePress}
      />
      <SettingRow
        icon={Camera}
        title="Model photo"
        subtitle={`${profile.counts.selfies} of 5 uploaded`}
        onPress={onSelfiesPress}
      />
      <SettingRow
        icon={Lock}
        title="Privacy"
        subtitle={profile.discoverable ? 'Discoverable' : 'Friends only'}
        onPress={onEditProfilePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
