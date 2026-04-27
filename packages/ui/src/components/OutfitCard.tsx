import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { Combination } from '@mei/types';
import { useTheme } from '../theme/ThemeProvider';

export interface OutfitCardProps {
  combination: Combination;
  /** Override the combination's own `name`. */
  name?: string;
  style?: ViewStyle;
}

const PLACEHOLDER_KEYS = ['cream', 'mauve', 'sage', 'blue', 'tan'] as const;
type PaletteKey = (typeof PLACEHOLDER_KEYS)[number];

/**
 * Composite of 3–4 thumb slots representing a Combination, plus a label.
 * Slots are pastel placeholders sized 3:4. Actual item thumbnails are
 * resolved at the screen level (Combination only carries `itemIds`).
 */
export function OutfitCard({ combination, name, style }: OutfitCardProps) {
  const theme = useTheme();
  const palette = theme.color.palette;
  const slotCount = Math.min(Math.max(combination.itemIds.length, 1), 4);
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const key = PLACEHOLDER_KEYS[i % PLACEHOLDER_KEYS.length] as PaletteKey;
    return palette[key];
  });

  const label = name ?? combination.name;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
        },
        style,
      ]}
      accessibilityLabel={label}
    >
      <View style={[styles.row, { gap: theme.space.sm }]}>
        {slots.map((bg, i) => (
          <View
            key={i}
            style={[
              styles.slot,
              {
                backgroundColor: bg,
                borderRadius: theme.radius.sm,
              },
            ]}
          />
        ))}
      </View>
      <Text
        style={[
          styles.label,
          {
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
            marginTop: theme.space.sm,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  slot: {
    flex: 1,
    aspectRatio: 3 / 4,
  },
  label: {
    includeFontPadding: false,
  },
});
