import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';
import { Header } from '@/components/chats/Header';
import { AskStellaChip } from '@/components/chats/AskStellaChip';
import { PinnedSection } from '@/components/chats/PinnedSection';
import { GroupsSection } from '@/components/chats/GroupsSection';
import { DirectSection } from '@/components/chats/DirectSection';
import { adaptThreadRow } from '@/components/chats/adapters';
import type { ChatThreadRow } from '@/components/chats/types';
import { useChatThreads } from '@/lib/hooks/useChatThreads';

/**
 * Chats inbox — SPEC §10.6, mockup `08 · CHATS INBOX`.
 *
 * Three sections in fixed order: Pinned (Stella), Groups (groups + hangouts
 * combined), Direct. Tapping a row pushes to `/chats/[id]`.
 */
export default function ChatsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { state, refetch } = useChatThreads();

  const handleSelect = (thread: ChatThreadRow) => {
    router.push(`/chats/${thread.id}` as never);
  };
  const askStella = () => router.push('/chats/stella');

  // ---- Loading: first paint, no data yet ------------------------------------
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Screen>
        <View style={[styles.center, { padding: theme.space.xxxl }]}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      </Screen>
    );
  }

  // ---- Hard error -----------------------------------------------------------
  if (state.status === 'error' && !state.lastData) {
    return (
      <Screen>
        <View style={[styles.center, { padding: theme.space.xxxl, gap: theme.space.md }]}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
              textAlign: 'center',
            }}
          >
            Couldn’t load chats
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {state.error.message}
          </Text>
          <Button variant="primary" onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      </Screen>
    );
  }

  // ---- Success or stale-with-error -----------------------------------------
  const data = state.status === 'success' ? state.data : state.lastData;
  if (!data) return null;

  const pinnedRows = data.pinned.map(adaptThreadRow);
  // Groups + hangouts share the section in the spec; keep their internal
  // recency order (server already sorted by last_message_at desc per group).
  const groupRows = [...data.groups, ...data.hangouts].map(adaptThreadRow);
  const directRows = data.direct.map(adaptThreadRow);
  const stellaUnread = pinnedRows.some((r) => r.unread > 0);

  return (
    <Screen scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
        contentContainerStyle={{ paddingBottom: theme.space.xxxl }}
      >
        <Header />
        {!stellaUnread && (
          <View style={{ marginTop: theme.space.md }}>
            <AskStellaChip onPress={askStella} />
          </View>
        )}
        <View style={{ marginTop: theme.space.sm }}>
          <PinnedSection threads={pinnedRows} onSelect={handleSelect} />
        </View>
        <View style={{ marginTop: theme.space.sm }}>
          <GroupsSection threads={groupRows} onSelect={handleSelect} />
        </View>
        <View style={{ marginTop: theme.space.sm }}>
          <DirectSection threads={directRows} onSelect={handleSelect} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
