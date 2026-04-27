import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { SectionHeader, useTheme } from '@mei/ui';
import type { MockFashionItem } from './mocks';

export interface FashionNowStripProps {
  items: MockFashionItem[];
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.space.sm, paddingRight: theme.space.lg }}
      >
        {items.map((item, i) => {
          const key = PALETTE_KEYS[i % PALETTE_KEYS.length] ?? 'cream';
          const bg = theme.color.palette[key];
          return (
            <View key={item.id} style={styles.card}>
              <View
                style={[
                  styles.thumb,
                  {
                    backgroundColor: bg,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              />
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
                  numberOfLines={1}
                >
                  {item.caption}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    width: 110,
  },
  thumb: {
    width: 110,
    height: 140,
  },
});
