import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, useTheme } from '@mei/ui';
import type { MyProfile } from '@/lib/hooks/useMyProfile';

export interface ProfileBlockProps {
  profile: MyProfile;
}

export function ProfileBlock({ profile }: ProfileBlockProps) {
  const theme = useTheme();
  const stylePreview = profile.stylePreferences.slice(0, 3).join(', ');
  const summary = [
    profile.city,
    stylePreview || 'Clean wardrobe',
  ].filter(Boolean).join(' · ');

  return (
    <Card tone="accent" padding={20} style={{ marginTop: theme.space.lg, borderRadius: 30 }}>
      <View style={[styles.avatarRow, { gap: theme.space.md }]}>
        <Avatar
          initials={profile.initials}
          size={76}
          ringed="plain"
          src={profile.avatarUrl}
        />
        <View style={styles.copy}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: 22,
              fontWeight: theme.type.weight.medium as '500',
            }}
            numberOfLines={1}
          >
            {profile.displayName}
          </Text>
          <Text
            style={{
              color: theme.color.text.secondary,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: theme.space.xs,
            }}
            numberOfLines={2}
          >
            {summary || `@${profile.username}`}
          </Text>
        </View>
      </View>

      <View style={[styles.stats, { gap: theme.space.sm, marginTop: theme.space.lg }]}>
        <Stat value={profile.counts.items} label="items" />
        <Stat value={profile.counts.ootds} label="looks" />
        <Stat value={profile.counts.selfies} label="selfies" />
      </View>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.stat,
        {
          backgroundColor:
            theme.mode === 'light' ? 'rgba(255,255,255,0.72)' : theme.color.bg.tertiary,
          borderRadius: 18,
        },
      ]}
    >
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.medium as '500',
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: theme.color.text.secondary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.medium as '500',
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  stats: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
