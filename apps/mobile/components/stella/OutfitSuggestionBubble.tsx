import { StyleSheet, Text, View } from 'react-native';
import { Bubble, OutfitCard, useTheme } from '@mei/ui';
import type { Combination } from '@mei/types';

export interface OutfitSuggestionBubbleProps {
  caption: string;
  combination: Combination;
}

/**
 * AI bubble that wraps a one-line caption above an OutfitCard mini-grid.
 * Wider than text bubbles so the 3-thumb grid breathes — SPEC §10.5.
 */
export function OutfitSuggestionBubble({
  caption,
  combination,
}: OutfitSuggestionBubbleProps) {
  const theme = useTheme();

  return (
    <Bubble from="ai" style={styles.wide}>
      <View>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            lineHeight: theme.type.size.body * theme.type.lineHeight.body,
            fontWeight: theme.type.weight.regular as '400',
          }}
        >
          {caption}
        </Text>
        <OutfitCard
          combination={combination}
          style={{
            marginTop: theme.space.sm,
            backgroundColor: theme.color.bg.tertiary,
          }}
        />
      </View>
    </Bubble>
  );
}

const styles = StyleSheet.create({
  // The default Bubble caps at 78%; outfit grid needs more room.
  wide: {
    maxWidth: '88%',
  },
});
