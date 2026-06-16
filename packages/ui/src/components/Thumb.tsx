import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { ClosetItem, ClothingCategory } from '@mei/types';
import { useTheme } from '../theme/ThemeProvider';

export type ThumbSize = 'sm' | 'md' | 'lg';

export interface ThumbProps {
  item: ClosetItem;
  size: ThumbSize;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_MAP: Record<ThumbSize, number> = {
  sm: 56,
  md: 80,
  lg: 112,
};

/**
 * Clothing item thumbnail. Aspect 3:4 portrait per mockup `.thumb-look`.
 * - Renders tunedPhotoUrl, falling back to thumbnailUrl/rawPhotoUrl over a
 *   category-tinted pastel placeholder.
 * - `selected` adds a 1.5px system-blue outline.
 */
export function Thumb({ item, size, selected = false, style }: ThumbProps) {
  const theme = useTheme();
  const width = SIZE_MAP[size];
  // 3:4 portrait
  const height = Math.round((width * 4) / 3);

  const placeholder = pickPlaceholder(item.category, theme.color.palette);
  const imageUrl = item.tunedPhotoUrl || item.thumbnailUrl || item.rawPhotoUrl;
  const [imageState, setImageState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    imageUrl ? 'loading' : 'idle',
  );

  useEffect(() => {
    setImageState(imageUrl ? 'loading' : 'idle');
  }, [imageUrl]);

  return (
    <View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: theme.radius.sm,
          backgroundColor: placeholder,
          borderWidth: selected ? 1.5 : 0,
          borderColor: selected ? theme.color.brand : 'transparent',
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={item.name}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          resizeMode="cover"
          onLoadStart={() => setImageState('loading')}
          onLoad={() => setImageState('loaded')}
          onError={() => setImageState('error')}
          style={[
            StyleSheet.absoluteFill,
            { opacity: imageState === 'loaded' ? 1 : 0 },
          ]}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {imageUrl && imageState !== 'loaded' && imageState !== 'error' ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator
            size="small"
            color={selected ? theme.color.brand : theme.color.text.tertiary}
          />
        </View>
      ) : null}
    </View>
  );
}

function pickPlaceholder(
  category: ClothingCategory,
  palette: { cream: string; mauve: string; sage: string; blue: string; tan: string }
): string {
  switch (category) {
    case 'DRESS':
      return palette.mauve;
    case 'TOP':
      return palette.cream;
    case 'BOTTOM':
      return palette.blue;
    case 'OUTERWEAR':
      return palette.tan;
    case 'SHOE':
      return palette.sage;
    case 'BAG':
      return palette.tan;
    case 'ACCESSORY':
    default:
      return palette.cream;
  }
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
