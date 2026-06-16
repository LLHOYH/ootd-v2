import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { SectionHeader, useTheme } from '@mei/ui';
import type { TodayFashionItem } from './types';

export interface FashionNowStripProps {
  items: TodayFashionItem[];
}

const PALETTE_KEYS = ['mauve', 'tan', 'cream', 'sage', 'blue'] as const;

export function FashionNowStrip({ items }: FashionNowStripProps) {
  const theme = useTheme();

  if (items.length === 0) return null;

  return (
    <View>
      <View style={[styles.titleRow, { gap: theme.space.xs }]}>
        <TrendingUp size={20} strokeWidth={1.6} color={theme.color.brand} />
        <View style={{ flex: 1 }}>
          <SectionHeader title="Fashion now" />
        </View>
      </View>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          marginTop: -theme.space.sm,
          marginBottom: theme.space.sm,
        }}
        numberOfLines={1}
      >
        Paris FW · Instagram · editorials
      </Text>

      <View style={[styles.grid, { marginTop: theme.space.xs }]}>
        {items.map((item, i) => {
          const key = PALETTE_KEYS[i % PALETTE_KEYS.length] ?? 'cream';
          const bg = theme.color.palette[key];
          const isEndOfRow = (i + 1) % 2 === 0;
          // Pastel background doubles as image-load placeholder + fallback
          // when an RSS item didn't carry a hero image.
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                if (item.sourceUrl) void Linking.openURL(item.sourceUrl);
              }}
              accessibilityRole={item.sourceUrl ? 'link' : 'image'}
              accessibilityLabel={`${item.source}: ${item.caption}`}
              style={({ pressed }) => [
                styles.card,
                {
                  marginRight: isEndOfRow ? 0 : '3%',
                  marginBottom: theme.space.lg,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.thumb,
                  {
                    backgroundColor: bg,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    resizeMode="cover"
                    style={StyleSheet.absoluteFill}
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
              </View>
              <View style={{ marginTop: theme.space.xs }}>
                <Text
                  style={{
                    color: theme.color.text.primary,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                  numberOfLines={1}
                >
                  {item.source}
                </Text>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                  }}
                  numberOfLines={2}
                >
                  {item.caption}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    width: '48.5%',
  },
  thumb: {
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
  },
});
