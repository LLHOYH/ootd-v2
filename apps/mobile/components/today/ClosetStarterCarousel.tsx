import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Shirt } from 'lucide-react-native';
import type { ClosetItem, ClothingCategory } from '@mei/types';
import { Button, Card, SectionHeader, Thumb, useTheme } from '@mei/ui';

export interface ClosetStarterCarouselProps {
  items: ClosetItem[];
  selfieCount: number;
  onAddClothes?: () => void;
  onCraftLook?: () => void;
  onViewSelfies?: () => void;
}

const MAX_STARTER_ITEMS = 12;

const CATEGORY_RANK: Record<ClothingCategory, number> = {
  DRESS: 0,
  TOP: 1,
  OUTERWEAR: 2,
  BOTTOM: 3,
  SHOE: 4,
  BAG: 5,
  ACCESSORY: 6,
};

function categoryLabel(category: ClothingCategory): string {
  switch (category) {
    case 'DRESS':
      return 'Dress';
    case 'TOP':
      return 'Top';
    case 'OUTERWEAR':
      return 'Layer';
    case 'BOTTOM':
      return 'Bottom';
    case 'SHOE':
      return 'Shoes';
    case 'BAG':
      return 'Bag';
    case 'ACCESSORY':
      return 'Accessory';
  }
}

function statusRank(item: ClosetItem): number {
  if (item.status === 'READY') return 0;
  if (item.status === 'PROCESSING') return 1;
  return 2;
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

export function ClosetStarterCarousel({
  items,
  selfieCount,
  onAddClothes,
  onCraftLook,
  onViewSelfies,
}: ClosetStarterCarouselProps) {
  const theme = useTheme();

  const starterItems = useMemo(
    () =>
      items
        .filter((item) => item.status !== 'FAILED')
        .sort((a, b) => {
          const statusDelta = statusRank(a) - statusRank(b);
          if (statusDelta !== 0) return statusDelta;
          const categoryDelta = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
          if (categoryDelta !== 0) return categoryDelta;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, MAX_STARTER_ITEMS),
    [items],
  );

  if (starterItems.length === 0) return null;

  const readyCount = items.filter((item) => item.status === 'READY').length;
  const dressCount = starterItems.filter((item) => item.category === 'DRESS').length;
  const hasEnoughSelfies = selfieCount >= 5;
  const canCraftLook = readyCount >= 2 && hasEnoughSelfies;

  const lead =
    dressCount > 0
      ? `${dressCount} dress photo${plural(dressCount)} ready.`
      : `${starterItems.length} closet photo${plural(starterItems.length)} ready.`;
  const nextStep = !hasEnoughSelfies
    ? 'Add selfies so Stella can fit them to you.'
    : canCraftLook
      ? 'Craft a look now, or add more clothes for better picks.'
      : 'Add one more clothing photo for a complete pick.';

  return (
    <View>
      <SectionHeader
        title="Today's pick"
        action={
          canCraftLook && onCraftLook
            ? { label: 'Craft look ->', onPress: onCraftLook }
            : undefined
        }
      />
      <Card padding={theme.space.lg}>
        <View style={[styles.headerRow, { gap: theme.space.md }]}>
          <View
            style={[
              styles.icon,
              {
                backgroundColor: theme.color.brandBg,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <Shirt size={20} strokeWidth={1.6} color={theme.color.brand} />
          </View>
          <View style={styles.copy}>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={1}
            >
              Closet pieces ready
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.caption,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: theme.space.xs,
              }}
            >
              {lead} {nextStep}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginTop: theme.space.md }}
          contentContainerStyle={{ gap: theme.space.md, paddingRight: theme.space.md }}
        >
          {starterItems.map((item) => {
            const pressTarget = canCraftLook ? onCraftLook : onAddClothes;
            return (
              <Pressable
                key={item.itemId}
                onPress={pressTarget}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                style={({ pressed }) => [
                  styles.itemCard,
                  { opacity: pressed && pressTarget ? 0.75 : 1 },
                ]}
              >
                <View style={styles.thumbWrap}>
                  <Thumb item={item} size="lg" style={styles.thumb} />
                </View>
                <Text
                  style={{
                    color: theme.color.text.primary,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.medium as '500',
                    marginTop: theme.space.xs,
                  }}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {item.status === 'PROCESSING' ? 'Cleaning...' : categoryLabel(item.category)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.lg }]}>
          {canCraftLook ? (
            <>
              <Button
                variant="primary"
                onPress={onCraftLook ?? (() => {})}
                style={styles.actionButton}
              >
                Craft look
              </Button>
              <Button
                variant="ghost"
                onPress={onAddClothes ?? (() => {})}
                style={styles.actionButton}
              >
                More clothes
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                onPress={onAddClothes ?? (() => {})}
                style={styles.actionButton}
              >
                Add clothes
              </Button>
              {!hasEnoughSelfies ? (
                <Button
                  variant="ghost"
                  onPress={onViewSelfies ?? (() => {})}
                  style={styles.actionButton}
                >
                  Selfies
                </Button>
              ) : null}
            </>
          )}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  itemCard: {
    width: 112,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
  },
});
