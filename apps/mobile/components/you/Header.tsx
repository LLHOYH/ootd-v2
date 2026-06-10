import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface YouHeaderProps {
  onSettingsPress?: () => void;
}

/**
 * "You" h1 plus an optional settings button for future detail routing.
 */
export function Header({ onSettingsPress }: YouHeaderProps) {
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
        You
      </Text>
      {onSettingsPress ? (
        <Pressable
          onPress={onSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={8}
          style={[
            styles.cog,
            {
              backgroundColor: theme.color.bg.secondary,
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Settings size={16} strokeWidth={1.6} color={theme.color.text.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cog: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
