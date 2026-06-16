import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { ClosetItem, ClothingCategory } from '@mei/types';
import { Button, Card, SectionHeader, Thumb, useTheme } from '@mei/ui';

export interface SuggestedTodayLook {
  id: string;
  name: string;
  note: string;
  items: ClosetItem[];
}

export interface ClosetStarterCarouselProps {
  items: ClosetItem[];
  selfieCount: number;
  creatingLookId?: string | null;
  errorMessage?: string | null;
  onAddClothes?: () => void;
  onWearSuggestedLook?: (look: SuggestedTodayLook) => void;
  onViewSelfies?: () => void;
}

const MAX_STARTER_ITEMS = 12;
const MAX_SUGGESTIONS = 6;

const CATEGORY_RANK: Record<ClothingCategory, number> = {
  DRESS: 0,
  TOP: 1,
  OUTERWEAR: 2,
  BOTTOM: 3,
  SHOE: 4,
  BAG: 5,
  ACCESSORY: 6,
};

function statusRank(item: ClosetItem): number {
  if (item.status === 'READY') return 0;
  if (item.status === 'PROCESSING') return 1;
  return 2;
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

function sortForToday(items: ClosetItem[]): ClosetItem[] {
  return [...items].sort((a, b) => {
    const statusDelta = statusRank(a) - statusRank(b);
    if (statusDelta !== 0) return statusDelta;
    const categoryDelta = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (categoryDelta !== 0) return categoryDelta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function firstByCategory(
  items: ClosetItem[],
  categories: ClothingCategory[],
  usedIds: Set<string>,
): ClosetItem | undefined {
  return items.find((item) => categories.includes(item.category) && !usedIds.has(item.itemId));
}

function buildSuggestedLooks(items: ClosetItem[]): SuggestedTodayLook[] {
  const ready = sortForToday(items.filter((item) => item.status === 'READY'));
  const suggestions: SuggestedTodayLook[] = [];
  const pushLook = (name: string, note: string, lookItems: ClosetItem[]) => {
    const deduped = lookItems.filter(
      (item, index, arr) => arr.findIndex((candidate) => candidate.itemId === item.itemId) === index,
    );
    if (deduped.length < 2) return;
    suggestions.push({
      id: deduped.map((item) => item.itemId).join(':'),
      name,
      note,
      items: deduped.slice(0, 4),
    });
  };

  for (const dress of ready.filter((item) => item.category === 'DRESS')) {
    const used = new Set([dress.itemId]);
    const companion =
      firstByCategory(ready, ['SHOE', 'BAG', 'ACCESSORY', 'OUTERWEAR'], used) ??
      firstByCategory(ready, ['TOP', 'BOTTOM'], used) ??
      firstByCategory(ready, ['DRESS'], used);
    if (companion) used.add(companion.itemId);
    const extra = firstByCategory(ready, ['BAG', 'ACCESSORY', 'SHOE', 'OUTERWEAR'], used);
    pushLook(
      `${dress.name} look`,
      companion ? `Stella pairs it with ${companion.name}.` : 'Stella can build from this dress.',
      [dress, ...(companion ? [companion] : []), ...(extra ? [extra] : [])],
    );
    if (suggestions.length >= MAX_SUGGESTIONS) return suggestions;
  }

  const tops = ready.filter((item) => item.category === 'TOP');
  const bottoms = ready.filter((item) => item.category === 'BOTTOM');
  for (const top of tops) {
    const bottom = bottoms.find((item) => item.itemId !== top.itemId);
    if (!bottom) continue;
    const used = new Set([top.itemId, bottom.itemId]);
    const extra = firstByCategory(ready, ['OUTERWEAR', 'SHOE', 'BAG', 'ACCESSORY'], used);
    pushLook(
      `${top.name} and ${bottom.name}`,
      extra ? `Finished with ${extra.name}.` : 'A simple top-and-bottom pick.',
      [top, bottom, ...(extra ? [extra] : [])],
    );
    if (suggestions.length >= MAX_SUGGESTIONS) return suggestions;
  }

  return suggestions;
}

export function ClosetStarterCarousel({
  items,
  selfieCount,
  creatingLookId = null,
  errorMessage = null,
  onAddClothes,
  onWearSuggestedLook,
  onViewSelfies,
}: ClosetStarterCarouselProps) {
  const theme = useTheme();

  const starterItems = useMemo(
    () =>
      sortForToday(items.filter((item) => item.status !== 'FAILED')).slice(0, MAX_STARTER_ITEMS),
    [items],
  );
  const suggestedLooks = useMemo(() => buildSuggestedLooks(items), [items]);

  if (starterItems.length === 0) return null;

  const readyCount = items.filter((item) => item.status === 'READY').length;
  const dressCount = starterItems.filter((item) => item.category === 'DRESS').length;
  const hasEnoughSelfies = selfieCount >= 5;
  const canRecommend = suggestedLooks.length > 0 && hasEnoughSelfies;

  const lead =
    dressCount > 0
      ? `${dressCount} dress photo${plural(dressCount)} ready.`
      : `${starterItems.length} closet photo${plural(starterItems.length)} ready.`;
  const nextStep = !hasEnoughSelfies
    ? 'Add selfies so Stella can fit them to you.'
    : canRecommend
      ? 'Stella made these starter picks from your closet.'
      : readyCount >= 1
        ? 'Add one more clothing photo so Stella can recommend combinations.'
        : 'Your photos are still being cleaned. Pull to refresh soon.';

  return (
    <View>
      <SectionHeader
        title="Today's pick"
        action={onAddClothes ? { label: 'More clothes', onPress: onAddClothes } : undefined}
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
            <Sparkles size={20} strokeWidth={1.6} color={theme.color.brand} />
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
              Stella's starter picks
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

        {errorMessage ? (
          <Text
            style={{
              color: theme.color.danger,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: theme.space.sm,
            }}
          >
            {errorMessage}
          </Text>
        ) : null}

        {canRecommend ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginTop: theme.space.md }}
            contentContainerStyle={{ gap: theme.space.md, paddingRight: theme.space.md }}
          >
            {suggestedLooks.map((look) => {
              const creating = creatingLookId === look.id;
              return (
                <View key={look.id} style={styles.lookCard}>
                  <View style={[styles.lookGrid, { gap: theme.space.sm }]}>
                    {look.items.slice(0, 4).map((item) => (
                      <View key={item.itemId} style={styles.lookThumbWrap}>
                        <Thumb item={item} size="lg" style={styles.lookThumb} />
                      </View>
                    ))}
                  </View>
                  <Text
                    style={{
                      color: theme.color.text.primary,
                      fontSize: theme.type.size.body,
                      fontWeight: theme.type.weight.medium as '500',
                      marginTop: theme.space.sm,
                    }}
                    numberOfLines={1}
                  >
                    {look.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.color.text.tertiary,
                      fontSize: theme.type.size.tiny,
                      fontWeight: theme.type.weight.regular as '400',
                      marginTop: 2,
                      minHeight: 34,
                    }}
                    numberOfLines={2}
                  >
                    {look.note}
                  </Text>
                  <Button
                    variant="primary"
                    onPress={() => onWearSuggestedLook?.(look)}
                    disabled={creating || creatingLookId != null}
                    style={{ marginTop: theme.space.md, minHeight: 48 }}
                  >
                    {creating ? 'Preparing...' : 'Wear this on me'}
                  </Button>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginTop: theme.space.md }}
            contentContainerStyle={{ gap: theme.space.md, paddingRight: theme.space.md }}
          >
            {starterItems.map((item) => (
              <View key={item.itemId} style={styles.itemCard}>
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
              </View>
            ))}
          </ScrollView>
        )}

        {!canRecommend ? (
          <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.lg }]}>
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
          </View>
        ) : null}
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
  lookCard: {
    width: 248,
  },
  lookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  lookThumbWrap: {
    width: '48.5%',
    aspectRatio: 3 / 4,
  },
  lookThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
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
    borderRadius: 18,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
  },
});
