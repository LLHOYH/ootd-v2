import { useEffect, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Heart } from 'lucide-react-native';
import { Card, Button, SectionHeader, Thumb, useTheme } from '@mei/ui';
import type { ClosetItem, Combination } from '@mei/types';

export interface TodaysPickCarouselItem {
  combination: Combination;
  /** Resolved items aligned with `combination.itemIds`. */
  items: (ClosetItem | undefined)[];
  saved: boolean;
}

export interface TodaysPickCardProps {
  picks: TodaysPickCarouselItem[];
  activeIndex: number;
  /** True while additional picks are being fetched into the carousel. */
  loadingMore?: boolean;
  /** Optional error from loading additional picks or saving. */
  errorMessage?: string | null;
  onActiveIndexChange?: (index: number) => void;
  onLoadMore?: () => void;
  onWear?: (combination: Combination) => void;
  onSave?: (combination: Combination) => void;
}

export function TodaysPickCard({
  picks,
  activeIndex,
  loadingMore = false,
  errorMessage = null,
  onActiveIndexChange,
  onLoadMore,
  onWear,
  onSave,
}: TodaysPickCardProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);

  const gap = theme.space.md;
  const cardWidth = Math.max(280, width - theme.space.xl * 2);
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(picks.length - 1, 0));

  const subtitle = errorMessage
    ? errorMessage
    : loadingMore
      ? 'Finding more closet looks…'
      : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: safeActiveIndex * (cardWidth + gap),
      animated: false,
    });
  }, [cardWidth, gap, safeActiveIndex]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + gap));
    const nextIndex = Math.min(Math.max(rawIndex, 0), Math.max(picks.length - 1, 0));
    onActiveIndexChange?.(nextIndex);
    if (nextIndex >= picks.length - 2) onLoadMore?.();
  };

  const dots = useMemo(
    () => picks.map((pick) => pick.combination.comboId),
    [picks],
  );

  if (picks.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Today's pick" />
      {subtitle ? (
        <Text
          style={{
            color: errorMessage ? theme.color.brand : theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            paddingHorizontal: theme.space.md,
            marginTop: -theme.space.xs,
            marginBottom: theme.space.xs,
          }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + gap}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap, paddingRight: gap }}
      >
        {picks.map(({ combination, items, saved }) => (
          <Card
            key={combination.comboId}
            tone="accent"
            padding={theme.space.lg}
            style={{ width: cardWidth, borderRadius: 28 }}
          >
            <View>
              <View style={[styles.photoGrid, { gap: theme.space.sm }]}>
                {Array.from({
                  length: Math.min(Math.max(combination.itemIds.length, 1), 4),
                }).map((_, index) => {
                  const item = items[index];
                  return (
                    <View
                      key={`${combination.comboId}-${index}`}
                      style={[
                        styles.photoSlot,
                        {
                          backgroundColor: placeholderFor(index, item, theme.color.palette),
                          borderRadius: 18,
                        },
                      ]}
                    >
                      {item ? <Thumb item={item} size="lg" style={styles.photoThumb} /> : null}
                    </View>
                  );
                })}
              </View>
              <View style={{ marginTop: theme.space.md }}>
                <Text
                  style={{
                    color: theme.color.text.primary,
                    fontSize: 22,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                  numberOfLines={1}
                >
                  {combination.name}
                </Text>
                <Text
                  style={{
                    color: theme.color.text.secondary,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.regular as '400',
                    marginTop: theme.space.xs,
                  }}
                  numberOfLines={2}
                >
                  Made from your closet for today's weather and plans.
                </Text>
              </View>
            </View>
            <View style={[styles.actions, { gap: theme.space.md, marginTop: theme.space.lg }]}>
              <Button
                variant="primary"
                onPress={() => onWear?.(combination)}
                style={{ flex: 1, minHeight: 54 }}
              >
                Wear this on me
              </Button>
              <Pressable
                onPress={() => onSave?.(combination)}
                accessibilityRole="button"
                accessibilityLabel={saved ? 'Unsave this look' : 'Save this look'}
                accessibilityState={{ selected: saved }}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.heartBtn,
                  {
                    borderRadius: theme.radius.pill,
                    borderColor: theme.color.border.strong,
                    backgroundColor: saved ? theme.color.brandBg : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Heart
                  size={24}
                  strokeWidth={1.6}
                  color={theme.color.brand}
                  fill={saved ? theme.color.brand : 'transparent'}
                />
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      {dots.length > 1 ? (
        <View style={[styles.dots, { gap: theme.space.xs, marginTop: theme.space.md }]}>
          {dots.map((id, index) => (
            <View
              key={id}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === safeActiveIndex ? theme.color.brand : theme.color.border.strong,
                  width: index === safeActiveIndex ? 18 : 6,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function placeholderFor(
  index: number,
  item: ClosetItem | undefined,
  palette: { cream: string; mauve: string; sage: string; blue: string; tan: string },
): string {
  switch (item?.category) {
    case 'DRESS':
      return palette.blue;
    case 'TOP':
      return palette.cream;
    case 'BOTTOM':
      return palette.tan;
    case 'OUTERWEAR':
      return palette.mauve;
    case 'SHOE':
      return palette.sage;
    case 'BAG':
    case 'ACCESSORY':
      return palette.tan;
    default: {
      const fallback = [palette.blue, palette.tan, palette.mauve, palette.sage];
      return fallback[index % fallback.length] ?? palette.cream;
    }
  }
}

const styles = StyleSheet.create({
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoSlot: {
    width: '48.5%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heartBtn: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
});
