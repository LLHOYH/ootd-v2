import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosetItem } from '@mei/types';
import { Thumb, useTheme } from '@mei/ui';

export interface ItemGridProps {
  items: ClosetItem[];
  size?: ClosetGridSize;
  onPressItem?: (item: ClosetItem) => void;
}

export type ClosetGridSize = 'compact' | 'medium' | 'large';

const GRID_CONFIG: Record<
  ClosetGridSize,
  {
    columns: number;
    widthPct: `${number}%`;
    marginPct: `${number}%`;
    thumb: 'md' | 'lg';
    labelLines: number;
  }
> = {
  compact: {
    columns: 3,
    widthPct: '31.2%',
    marginPct: '3.2%',
    thumb: 'md',
    labelLines: 2,
  },
  medium: {
    columns: 2,
    widthPct: '48%',
    marginPct: '4%',
    thumb: 'lg',
    labelLines: 1,
  },
  large: {
    columns: 1,
    widthPct: '100%',
    marginPct: '0%',
    thumb: 'lg',
    labelLines: 2,
  },
};

function imageUrlForItem(item: ClosetItem): string | null {
  return item.thumbnailUrl || item.tunedPhotoUrl || item.rawPhotoUrl || null;
}

/**
 * Photo-first grid of `Thumb`s. The parent can switch Compact/Medium/Large so
 * users can scan quickly or inspect garments more closely.
 */
export function ItemGrid({ items, size = 'medium', onPressItem }: ItemGridProps) {
  const theme = useTheme();
  const grid = GRID_CONFIG[size];

  useEffect(() => {
    const prefetchCount = size === 'compact' ? 18 : size === 'medium' ? 10 : 6;
    const urls = Array.from(
      new Set(
        items
          .slice(0, prefetchCount)
          .map(imageUrlForItem)
          .filter((url): url is string => Boolean(url)),
      ),
    );
    for (const url of urls) {
      void Image.prefetch(url).catch(() => undefined);
    }
  }, [items, size]);

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
        const isEndOfRow = (index + 1) % grid.columns === 0;
        return (
          <Pressable
            key={item.itemId}
            onPress={() => onPressItem?.(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={({ pressed }) => [
              styles.cell,
              {
                width: grid.widthPct,
                marginRight: isEndOfRow ? 0 : grid.marginPct,
                marginBottom: size === 'compact' ? theme.space.lg : theme.space.xl,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.thumbWrap}>
              <Thumb
                item={item}
                size={grid.thumb}
                style={[
                  styles.thumb,
                  { borderRadius: size === 'compact' ? 16 : 22 },
                ]}
              />
            </View>
            <Text
              style={{
                marginTop: theme.space.xs,
                color: theme.color.text.primary,
                fontSize: size === 'compact' ? theme.type.size.tiny : theme.type.size.caption,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={grid.labelLines}
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
