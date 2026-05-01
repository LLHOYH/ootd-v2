import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ClothingCategory } from '@mei/types';
import { Chip, useTheme } from '@mei/ui';

export type FilterKey = 'ALL' | ClothingCategory | 'COMBINATIONS';

export interface FilterOption {
  key: FilterKey;
  label: string;
}

/** Order matches SPEC §10.2: All | Dresses | Tops | Bottoms | Shoes | Bags | Combinations. */
export const FILTER_OPTIONS: FilterOption[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRESS', label: 'Dresses' },
  { key: 'TOP', label: 'Tops' },
  { key: 'BOTTOM', label: 'Bottoms' },
  { key: 'SHOE', label: 'Shoes' },
  { key: 'BAG', label: 'Bags' },
  { key: 'COMBINATIONS', label: 'Combinations' },
];

export interface FilterChipsProps {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}

export function FilterChips({ active, onChange }: FilterChipsProps) {
  const theme = useTheme();

  return (
    // `flexGrow: 0` is critical: a horizontal ScrollView inside a flex
    // column otherwise expands to fill available vertical space (visible
    // on web via react-native-web; also bites on iOS/Android when the
    // parent has flex pressure). That pushes the grid below it to the
    // wrong vertical position. With `flexGrow: 0` the strip sizes to its
    // content like a normal row.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: theme.space.md, flexGrow: 0 }}
      contentContainerStyle={[styles.row, { gap: theme.space.sm }]}
    >
      {FILTER_OPTIONS.map((opt) => (
        <View key={opt.key}>
          <Chip
            active={active === opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityLabel={`Filter by ${opt.label.toLowerCase()}`}
          >
            {opt.label}
          </Chip>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
});
