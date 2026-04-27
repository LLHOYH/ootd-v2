import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Sparkles, X } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface SetupBannerProps {
  onPress?: () => void;
  onDismiss?: () => void;
}

export function SetupBanner({ onPress, onDismiss }: SetupBannerProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add 5 selfies for try-on photos"
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.color.brandBg,
          borderRadius: theme.radius.md,
          paddingVertical: theme.space.sm,
          paddingHorizontal: theme.space.md,
          gap: theme.space.sm,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Sparkles size={20} strokeWidth={1.6} color={theme.color.brandOn} />
      <Text
        style={{
          flex: 1,
          color: theme.color.brandOn,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.medium as '500',
        }}
        numberOfLines={1}
      >
        Add 5 selfies for try-on photos
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
      >
        <X size={20} strokeWidth={1.6} color={theme.color.brandOn} />
      </Pressable>
      <ChevronRight size={20} strokeWidth={1.6} color={theme.color.brandOn} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
