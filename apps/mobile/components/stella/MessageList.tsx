import { ScrollView, StyleSheet, View } from 'react-native';
import { Bubble, useTheme } from '@mei/ui';
import type { StellaMessage } from './mocks';
import { OutfitSuggestionBubble } from './OutfitSuggestionBubble';

export interface MessageListProps {
  messages: StellaMessage[];
}

/**
 * Scrollable message list. Each message renders as a Bubble (text) or an
 * OutfitSuggestionBubble (embedded outfit card). SPEC §10.5.
 */
export function MessageList({ messages }: MessageListProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        {
          paddingVertical: theme.space.md,
          gap: theme.space.sm,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {messages.map((msg) => {
        if (msg.kind === 'outfit') {
          return (
            <View key={msg.id}>
              <OutfitSuggestionBubble
                caption={msg.caption}
                combination={msg.combination}
              />
            </View>
          );
        }
        return (
          <Bubble key={msg.id} from={msg.from}>
            {msg.text}
          </Bubble>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});
