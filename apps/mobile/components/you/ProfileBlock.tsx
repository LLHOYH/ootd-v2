import { StyleSheet, Text, View } from 'react-native';
import { Avatar, useTheme } from '@mei/ui';
import type { MyProfile } from '@/lib/hooks/useMyProfile';

export interface ProfileBlockProps {
  profile: MyProfile;
}

/**
 * Large avatar + display name (h1) + @username + city.
 * SPEC §10.11 step 2.
 */
export function ProfileBlock({ profile }: ProfileBlockProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { marginTop: theme.space.md + 2 }]}>
      <Avatar
        initials={profile.initials}
        size={76}
        ringed="pink"
        src={profile.avatarUrl}
      />
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.h1,
          fontWeight: theme.type.weight.medium as '500',
          marginTop: theme.space.sm,
        }}
      >
        {profile.displayName}
      </Text>
      <Text
        style={{
          color: theme.color.text.secondary,
          fontSize: theme.type.size.caption,
          fontWeight: theme.type.weight.regular as '400',
          marginTop: 2,
        }}
      >
        @{profile.username}
      </Text>
      {profile.city ? (
        <Text
          style={{
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            marginTop: 2,
          }}
        >
          {profile.city}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});
