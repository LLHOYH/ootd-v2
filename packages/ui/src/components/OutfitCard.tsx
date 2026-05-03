import React from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { ClosetItem, Combination } from '@mei/types';
import { useTheme } from '../theme/ThemeProvider';

export interface OutfitCardProps {
  combination: Combination;
  /** Override the combination's own `name`. */
  name?: string;
  /**
   * Resolved items for this combination, ordered to match `combination.itemIds`.
   * When provided, each slot renders the item's `thumbnailUrl` over the pastel
   * placeholder (the placeholder shows during image load and as a fallback for
   * items still in PROCESSING with no `thumbnailUrl` yet). When omitted, the
   * card stays in placeholder-only mode — caller hasn't resolved them yet.
   */
  items?: (ClosetItem | undefined)[];
  style?: ViewStyle;
}

const PLACEHOLDER_KEYS = ['cream', 'mauve', 'sage', 'blue', 'tan'] as const;
type PaletteKey = (typeof PLACEHOLDER_KEYS)[number];

/**
 * Composite of 3–4 thumb slots representing a Combination, plus a label.
 * Slots are pastel placeholders sized 3:4 by default; pass `items` to layer
 * real photos on top.
 */
export function OutfitCard({ combination, name, items, style }: OutfitCardProps) {
  const theme = useTheme();
  const palette = theme.color.palette;
  const slotCount = Math.min(Math.max(combination.itemIds.length, 1), 4);
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const key = PLACEHOLDER_KEYS[i % PLACEHOLDER_KEYS.length] as PaletteKey;
    const item = items?.[i];
    return {
      bg: palette[key],
      // Prefer the small thumbnail (image-worker output). Fall back to the
      // tuned full-size if the worker hasn't produced a thumb yet.
      uri: item?.thumbnailUrl || item?.tunedPhotoUrl || null,
    };
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
        {slots.map((slot, i) => (
          <View
            key={i}
            style={[
              styles.slot,
              {
                backgroundColor: slot.bg,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            {slot.uri ? (
              <Image
                source={{ uri: slot.uri }}
                style={StyleSheet.absoluteFill}
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </View>
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
    // Clip the image to the rounded slot — without this the Image renders
    // a square corner over the View's borderRadius.
    overflow: 'hidden',
  },
  label: {
    includeFontPadding: false,
  },
});
