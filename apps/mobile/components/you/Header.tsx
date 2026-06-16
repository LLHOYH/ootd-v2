import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface YouHeaderProps {
  onSettingsPress?: () => void;
}

/**
 * "Profile / You" large-title header plus an optional edit button.
 */
export function Header({ onSettingsPress }: YouHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View>
        <Text
          style={{
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.medium as '500',
            marginBottom: theme.space.xs,
            textTransform: 'uppercase',
          }}
        >
          Profile
        </Text>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.h1,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          You
        </Text>
      </View>
      {onSettingsPress ? (
        <Pressable
          onPress={onSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          hitSlop={8}
          style={[
            styles.cog,
            {
              backgroundColor: theme.color.bg.secondary,
              borderRadius: theme.radius.pill,
              borderColor: theme.color.border.default,
            },
          ]}
        >
          <Pencil size={20} strokeWidth={1.6} color={theme.color.text.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cog: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
