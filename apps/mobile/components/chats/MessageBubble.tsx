// One message bubble in a thread. Wraps the design-system Bubble with the
// minimum logic the chat screen needs: pick a from-side based on senderId,
// dim pending optimistic rows, render kinds we support today (TEXT only —
// CLOSET_ITEM / COMBINATION / OOTD / IMAGE land with feat/wire-chat-cards
// once closet + ootd are wired).

import { StyleSheet, Text, View } from 'react-native';
import { Bubble, useTheme } from '@mei/ui';
import type { ChatMessage, ChatMessageKind } from '@mei/types';

export interface MessageBubbleProps {
  message: ChatMessage & { pending?: boolean };
  /** True when this bubble is sent by the current user. */
  fromMe: boolean;
}

const PLACEHOLDER_BY_KIND: Record<Exclude<ChatMessageKind, 'TEXT'>, string> = {
  CLOSET_ITEM: '👗 Closet item',
  COMBINATION: '🧥 Outfit',
  OOTD: '📸 OOTD',
  IMAGE: '🖼️ Image',
};

export function MessageBubble({ message, fromMe }: MessageBubbleProps) {
  const theme = useTheme();
  const from = fromMe ? 'user' : 'friend';
  const isPending = message.pending === true;

  return (
    <View
      style={[
        styles.row,
        {
          marginVertical: 3,
          opacity: isPending ? 0.5 : 1,
        },
      ]}
    >
      <Bubble from={from}>
        {message.kind === 'TEXT' ? (
          message.text ?? ''
        ) : (
          <Text
            style={{
              color: fromMe ? '#FFFFFF' : theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.regular as '400',
              fontStyle: 'italic',
            }}
          >
            {PLACEHOLDER_BY_KIND[message.kind] ?? message.kind}
          </Text>
        )}
      </Bubble>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
