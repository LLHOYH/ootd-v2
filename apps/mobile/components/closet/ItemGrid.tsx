import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosetItem } from '@mei/types';
import { Thumb, useTheme } from '@mei/ui';

export interface ItemGridProps {
  items: ClosetItem[];
  onPressItem?: (item: ClosetItem) => void;
}

const COLUMNS = 2;
// Slightly under 1/2 so the cell-gap fits between two columns.
const CELL_WIDTH_PCT = '48%';

/**
 * 2-column photo-first grid of `Thumb`s. Renders inside the parent ScrollView so the
 * whole closet body scrolls together — closets are bounded (tens to low
 * hundreds of items in P0) so virtualization isn't needed yet.
 */
export function ItemGrid({ items, onPressItem }: ItemGridProps) {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <View style={{ marginTop: theme.space.xl, alignItems: 'center' }}>
        <Text
          style={{
            color: theme.color.text.secondary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.regular as '400',
          }}
        >
          Nothing here yet.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.grid,
        { marginTop: theme.space.md },
      ]}
    >
      {items.map((item, index) => {
        const isEndOfRow = (index + 1) % COLUMNS === 0;
        return (
          <Pressable
            key={item.itemId}
            onPress={() => onPressItem?.(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={({ pressed }) => [
              styles.cell,
              {
                width: CELL_WIDTH_PCT,
                marginRight: isEndOfRow ? 0 : '4%',
                marginBottom: theme.space.xl,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.thumbWrap}>
              <Thumb item={item} size="lg" style={styles.thumb} />
            </View>
            <Text
              style={{
                marginTop: theme.space.xs,
                color: theme.color.text.primary,
                fontSize: theme.type.size.caption,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
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
    // width and margins are applied inline based on column index.
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
});
