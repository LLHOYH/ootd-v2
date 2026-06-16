import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { Card, Button, SectionHeader, Thumb, useTheme } from '@mei/ui';
import type { ClosetItem, Combination } from '@mei/types';

export interface TodaysPickCardProps {
  combination: Combination;
  /** Resolved items aligned with `combination.itemIds`. Forwarded straight to
   * the slots render real photos instead of pastel rectangles. */
  items?: (ClosetItem | undefined)[];
  /** True when the user has tapped the heart for this combo. Renders a filled
   * heart instead of an outline. State is owned by the parent so it can later
   * be persisted to the server without changing this component's shape. */
  saved?: boolean;
  /** True while a "Try another" request is in flight. Disables the action and
   * swaps in a spinner so the user gets clear feedback. */
  picking?: boolean;
  /** Optional error from the most recent "Try another" request. Rendered as a
   * thin caption under the section header so the user knows the swap failed
   * without a disruptive toast. */
  errorMessage?: string | null;
  onTryAnother?: () => void;
  onWear?: () => void;
  onSave?: () => void;
}

export function TodaysPickCard({
  combination,
  items,
  saved = false,
  picking = false,
  errorMessage = null,
  onTryAnother,
  onWear,
  onSave,
}: TodaysPickCardProps) {
  const theme = useTheme();

  // Loading + error caption text. Kept tiny on purpose — the section
  // header's "Try another" action carries the eye, this is a footnote.
  const subtitle = picking
    ? 'Finding another look…'
    : errorMessage
      ? errorMessage
      : null;

  return (
    <View>
      <SectionHeader
        title="Today's pick"
        action={{
          label: picking ? 'Trying...' : 'Try another',
          onPress: () => {
            if (picking) return;
            onTryAnother?.();
          },
        }}
      />
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
      <Card
        tone="accent"
        padding={theme.space.lg}
        style={{ borderRadius: 28 }}
      >
        <View style={picking ? styles.dim : undefined}>
          <View style={[styles.photoGrid, { gap: theme.space.sm }]}>
            {Array.from({
              length: Math.min(Math.max(combination.itemIds.length, 1), 4),
            }).map((_, index) => {
              const item = items?.[index];
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
            onPress={onWear ?? (() => {})}
            style={{ flex: 1, minHeight: 54 }}
          >
            Wear this on me
          </Button>
          {/* Heart toggle. We render a Pressable directly (not <Button>) so
              we can fill the icon based on `saved` — Button doesn't expose
              an icon-fill prop and the design calls for a clear filled vs
              outline distinction (SPEC §10.1 ghost ♡ save action). */}
          <Pressable
            onPress={onSave ?? (() => {})}
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
  dim: {
    opacity: 0.55,
  },
});
