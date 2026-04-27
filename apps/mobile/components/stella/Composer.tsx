import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Mic } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

/**
 * Decorative composer — pill input + camera icon (left) + mic icon inside a
 * brand-pink circle (right). SPEC §10.5. Pressing send is a no-op until the
 * SSE wiring lands.
 */
export function Composer() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space.sm,
          paddingVertical: theme.space.sm,
          gap: theme.space.sm,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a photo"
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      >
        <Camera size={16} color={theme.color.text.secondary} strokeWidth={1.6} />
      </Pressable>

      <Text
        style={[
          styles.placeholder,
          {
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.caption,
            fontWeight: theme.type.weight.regular as '400',
          },
        ]}
        numberOfLines={1}
      >
        Ask Stella anything…
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice message"
        hitSlop={8}
        style={({ pressed }) => [
          styles.micBtn,
          {
            backgroundColor: theme.color.brand,
            borderRadius: theme.radius.pill,
          },
          pressed && styles.pressed,
        ]}
      >
        <Mic size={14} color="#FFFFFF" strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    flex: 1,
    includeFontPadding: false,
  },
  micBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
