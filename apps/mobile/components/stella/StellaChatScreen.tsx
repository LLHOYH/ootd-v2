import { StyleSheet, View } from 'react-native';
import { Screen, useTheme } from '@mei/ui';

import { StellaHeader } from './Header';
import { MessageList } from './MessageList';
import { QuickReplyStrip } from './QuickReplyStrip';
import { Composer } from './Composer';
import { mockConversation, mockQuickReplies } from './mocks';

/**
 * Stella chat — SPEC §10.5. Pushed as a normal chat detail (not a modal) per
 * CHANGES.md changeset 01: Stella lives as a pinned thread in Chats.
 * Static mock for now; SSE streaming lands later in P0.
 */
export function StellaChatScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <View style={[styles.container, { gap: theme.space.sm }]}>
        <StellaHeader />
        <MessageList messages={mockConversation} />
        <QuickReplyStrip replies={mockQuickReplies} />
        <View style={{ paddingBottom: theme.space.md }}>
          <Composer />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
