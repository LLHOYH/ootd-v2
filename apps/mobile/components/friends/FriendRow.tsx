// One-line user row for the Friends/Suggested/Pending/Search lists.
//
// Common props:
//   - user: the public summary to show
//   - subtitle: optional secondary line (e.g. "12 mutual", "From your contacts")
//
// Action area is a render-prop so each tab can decide what to show without
// FriendRow growing a per-tab boolean prop. Examples:
//   - Suggested:     <Button variant="ghost">Add</Button>
//   - Search result: <Button variant="ghost">Add</Button> | "Pending" chip
//   - Inbound req:   Accept + Decline icon buttons
//   - Outbound req:  "Pending" chip + cancel icon
//   - Friends list:  Unfriend overflow (or simply `null` for v1)

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, useTheme } from '@mei/ui';

export interface FriendRowUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  city?: string;
}

export interface FriendRowProps {
  user: FriendRowUser;
  subtitle?: string;
  onPress?: () => void;
  /** Right-aligned action area. Wire buttons here. */
  trailing?: ReactNode;
}

function deriveInitials(displayName: string, username: string): string {
  const cleaned = displayName.trim().replace(/[^a-zA-Z\s]/g, '');
  if (cleaned.length > 0) {
    const parts = cleaned.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    if (first && second) return (first + second).toUpperCase();
    if (first) return first.toUpperCase();
  }
  return (username[0] ?? '?').toUpperCase();
}

export function FriendRow({ user, subtitle, onPress, trailing }: FriendRowProps) {
  const theme = useTheme();
  const initials = deriveInitials(user.displayName, user.username);

  const body = (
    <View style={[styles.row, { gap: theme.space.md }]}>
      <Avatar
        size={44}
        initials={initials}
        src={user.avatarUrl}
        ringed="plain"
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          }}
          numberOfLines={1}
        >
          {user.displayName}
        </Text>
        <Text
          style={{
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {subtitle ?? `@${user.username}`}
        </Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.padding}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${user.username}'s profile`}
      style={({ pressed }) => [
        styles.padding,
        pressed && { opacity: 0.6 },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  padding: {
    paddingVertical: 8,
  },
});
