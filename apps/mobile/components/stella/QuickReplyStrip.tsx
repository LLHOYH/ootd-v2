import { ScrollView, StyleSheet } from 'react-native';
import { Chip, useTheme } from '@mei/ui';

export interface QuickReplyStripProps {
  replies: string[];
  onSelect?: (reply: string) => void;
}

/**
 * Horizontal chip strip above the composer. SPEC §10.5: "Show alternatives",
 * "Different vibe", "Wear this". Replies are dynamic — Stella may return them
 * in the response payload (wired later).
 */
export function QuickReplyStrip({ replies, onSelect }: QuickReplyStripProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { gap: theme.space.xs + 2 }]}
    >
      {replies.map((reply) => (
        <Chip key={reply} onPress={onSelect ? () => onSelect(reply) : undefined}>
          {reply}
        </Chip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
