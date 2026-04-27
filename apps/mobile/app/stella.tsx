import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, X } from 'lucide-react-native';
import { Screen, useTheme } from '@mei/ui';

export default function StellaModal() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Sparkles size={18} color={theme.color.brand} strokeWidth={1.6} />
          <Text style={[styles.title, { color: theme.color.text.primary }]}>Stella</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
        >
          <X size={20} color={theme.color.text.secondary} strokeWidth={1.6} />
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: theme.color.text.secondary }]}>
        Your AI stylist · online
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.color.brandBg,
            borderRadius: theme.radius.md,
            padding: theme.space.lg,
            marginTop: theme.space.lg,
          },
        ]}
      >
        <Text style={[styles.cardLabel, { color: theme.color.brand }]}>STELLA · AI STYLIST</Text>
        <Text style={[styles.cardBody, { color: theme.color.brandOn }]}>
          Placeholder. Streaming chat + outfit cards land later in P0 — see SPEC.md §10.5.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  card: {},
  cardLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '500',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
