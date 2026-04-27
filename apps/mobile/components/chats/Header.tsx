import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Edit3, Search } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface ChatsHeaderProps {
  onSearch?: () => void;
  onCompose?: () => void;
}

/**
 * Chats inbox header — "Chats" title on the left, two circular icon buttons
 * on the right (search + new-message). Mirrors the mockup's `08 · CHATS INBOX`.
 */
export function Header({ onSearch, onCompose }: ChatsHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.h1,
          fontWeight: theme.type.weight.medium as '500',
        }}
      >
        Chats
      </Text>
      <View style={[styles.actions, { gap: theme.space.xs + 2 }]}>
        <IconButton
          accessibilityLabel="Search chats"
          onPress={onSearch}
          icon={
            <Search
              size={14}
              strokeWidth={1.6}
              color={theme.color.text.primary}
            />
          }
        />
        <IconButton
          accessibilityLabel="New message"
          onPress={onCompose}
          icon={
            <Edit3
              size={14}
              strokeWidth={1.6}
              color={theme.color.text.primary}
            />
          }
        />
      </View>
    </View>
  );
}

interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
}

function IconButton({ icon, onPress, accessibilityLabel }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.iconBtn,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.pill,
        },
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
