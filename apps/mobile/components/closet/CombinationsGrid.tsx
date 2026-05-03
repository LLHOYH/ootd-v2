import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ClosetItem, Combination } from '@mei/types';
import { OutfitCard, useTheme } from '@mei/ui';

export interface CombinationsGridProps {
  combinations: Combination[];
  /** All of the user's items, used to resolve each combination's `itemIds`
   * into real photos. The closet screen already has these loaded in the
   * same hook, so passing them down avoids a second fetch. */
  items?: ClosetItem[];
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
  items,
  onPressCombination,
}: CombinationsGridProps) {
  const theme = useTheme();

  // Index items by id once per render so each card's lookup is O(1).
  const itemsById = useMemo(() => {
    const map = new Map<string, ClosetItem>();
    for (const item of items ?? []) map.set(item.itemId, item);
    return map;
  }, [items]);

  return (
    <View style={[styles.grid, { marginTop: theme.space.md }]}>
      {combinations.map((combo, index) => {
        const isEndOfRow = (index + 1) % COLUMNS === 0;
        const resolved = combo.itemIds.map((id) => itemsById.get(id));
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
            <OutfitCard combination={combo} items={resolved} />
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
