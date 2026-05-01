import { ScrollView, StyleSheet, View } from 'react-native';
import { Bubble, useTheme } from '@mei/ui';
import type { StellaUiMessage } from '@/lib/hooks/useStellaConversation';

export interface MessageListProps {
  messages: StellaUiMessage[];
  /** Visible while Stella is mid-tool-call. e.g. "running list_closet…" */
  assistantStatus?: string;
}

/**
 * Scrollable Stella-conversation message list.
 *
 * For now we render text-only bubbles — outfit / closet / OOTD card bubbles
 * land in feat/wire-stella-tools once we can resolve the referenced rows
 * via the closet + ootd queries. Pending streaming-assistant rows show a
 * subtle ▍ caret while waiting on more deltas.
 */
export function MessageList({ messages, assistantStatus }: MessageListProps) {
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
        const text = msg.text ?? '';
        const isAssistant = msg.role === 'ASSISTANT';
        const isStreamingEmpty = msg.pending && isAssistant && text.length === 0;
        const display = isStreamingEmpty
          ? '…'
          : msg.pending && isAssistant
            ? `${text}▍`
            : text;
        return (
          <Bubble key={msg.messageId} from={isAssistant ? 'ai' : 'user'}>
            {display}
          </Bubble>
        );
      })}
      {assistantStatus ? (
        <View style={{ paddingHorizontal: theme.space.sm }}>
          <Bubble from="ai">{assistantStatus}</Bubble>
        </View>
      ) : null}
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
