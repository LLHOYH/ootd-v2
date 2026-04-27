import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

/**
 * Stella chat header — SPEC §10.5.
 * Back arrow (closes the modal), "Stella" + sparkle, "Your AI stylist · online" subtitle.
 */
export function StellaHeader() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.row, { gap: theme.space.md }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={({ pressed }) => [
          styles.backBtn,
          {
            backgroundColor: theme.color.bg.secondary,
            borderRadius: theme.radius.pill,
          },
          pressed && styles.pressed,
        ]}
      >
        <ArrowLeft size={16} color={theme.color.text.primary} strokeWidth={1.6} />
      </Pressable>

      <View style={styles.titleColumn}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              },
            ]}
          >
            Stella
          </Text>
          <Sparkles size={14} color={theme.color.brand} strokeWidth={1.6} />
        </View>
        <Text
          style={[
            styles.subtitle,
            {
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            },
          ]}
        >
          Your AI stylist · online
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    includeFontPadding: false,
  },
  subtitle: {
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
