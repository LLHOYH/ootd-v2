import { StyleSheet, Text, View } from 'react-native';
import { Screen, useTheme } from '@mei/ui';

export interface PlaceholderProps {
  title: string;
  subtitle: string;
  mockupLabel: string;
}

export function Placeholder({ title, subtitle, mockupLabel }: PlaceholderProps) {
  const theme = useTheme();
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.h1, { color: theme.color.text.primary }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.color.text.secondary }]}>
          {subtitle}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.color.bg.secondary,
            borderRadius: theme.radius.md,
            padding: theme.space.lg,
          },
        ]}
      >
        <Text style={[styles.label, { color: theme.color.brand }]}>{mockupLabel}</Text>
        <Text style={[styles.body, { color: theme.color.text.secondary }]}>
          Placeholder screen. Real content lands later in P0 — see SPEC.md §10.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  h1: {
    fontSize: 22,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '500',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
});
