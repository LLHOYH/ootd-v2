import { StyleSheet, View } from 'react-native';
import { Screen, useTheme } from '@mei/ui';

import { StellaHeader } from '@/components/stella/Header';
import { MessageList } from '@/components/stella/MessageList';
import { QuickReplyStrip } from '@/components/stella/QuickReplyStrip';
import { Composer } from '@/components/stella/Composer';
import { mockConversation, mockQuickReplies } from '@/components/stella/mocks';

/**
 * Stella chat — SPEC §10.5. Modal route, presented via expo-router config in
 * `app/_layout.tsx`. Static mock for now; SSE streaming + real conversation
 * persistence land later in P0.
 */
export default function StellaModal() {
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
