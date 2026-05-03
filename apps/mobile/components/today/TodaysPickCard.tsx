import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { Card, OutfitCard, Button, SectionHeader, useTheme } from '@mei/ui';
import type { Combination } from '@mei/types';

export interface TodaysPickCardProps {
  combination: Combination;
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
          label: picking ? 'Trying…' : 'Try another →',
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
      <Card tone="pink">
        <View style={picking ? styles.dim : undefined}>
          <OutfitCard
            combination={combination}
            style={{ backgroundColor: 'transparent', padding: 0 }}
          />
        </View>
        <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.sm }]}>
          <Button
            variant="primary"
            onPress={onWear ?? (() => {})}
            style={{ flex: 1 }}
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
              size={20}
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

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heartBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dim: {
    opacity: 0.55,
  },
});
