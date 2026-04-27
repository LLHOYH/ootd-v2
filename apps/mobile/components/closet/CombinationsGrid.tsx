import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Combination } from '@mei/types';
import { OutfitCard, useTheme } from '@mei/ui';

export interface CombinationsGridProps {
  combinations: Combination[];
  onPressCombination?: (combination: Combination) => void;
}

const COLUMNS = 2;
// Slightly under 1/2 so the cell-gap fits between two columns.
const CELL_WIDTH_PCT = '48.5%';

/**
 * 2-column grid of `OutfitCard`s. Combinations stay relatively few in P0
 * (tens at most), so a non-virtualized wrap is fine.
 */
export function CombinationsGrid({
  combinations,
  onPressCombination,
}: CombinationsGridProps) {
  const theme = useTheme();

  return (
    <View style={[styles.grid, { marginTop: theme.space.md }]}>
      {combinations.map((combo, index) => {
        const isEndOfRow = (index + 1) % COLUMNS === 0;
        return (
          <Pressable
            key={combo.comboId}
            onPress={() => onPressCombination?.(combo)}
            accessibilityRole="button"
            accessibilityLabel={combo.name}
            style={({ pressed }) => [
              styles.cell,
              {
                width: CELL_WIDTH_PCT,
                marginRight: isEndOfRow ? 0 : '3%',
                marginBottom: theme.space.md,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <OutfitCard combination={combo} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    // width and margins applied inline.
  },
});
