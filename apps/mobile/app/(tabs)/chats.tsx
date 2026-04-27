import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, useTheme } from '@mei/ui';
import { Header } from '@/components/chats/Header';
import { PinnedSection } from '@/components/chats/PinnedSection';
import { GroupsSection } from '@/components/chats/GroupsSection';
import { DirectSection } from '@/components/chats/DirectSection';
import { mockThreads, type MockThread } from '@/components/chats/mocks';

/**
 * Chats inbox — SPEC §10.6, mockup `08 · CHATS INBOX`.
 *
 * Three sections in fixed order: Pinned (Stella), Groups (incl. hangouts),
 * Direct. Tapping a row pushes to `/chat/[id]`.
 */
export default function ChatsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const { pinned, groups, direct } = useMemo(() => groupThreads(mockThreads), []);

  const handleSelect = (thread: MockThread) => {
    router.push(`/chat/${thread.id}` as never);
  };

  return (
    <Screen scroll>
      <Header />
      <View style={{ marginTop: theme.space.sm }}>
        <PinnedSection threads={pinned} onSelect={handleSelect} />
      </View>
      <View style={{ marginTop: theme.space.sm }}>
        <GroupsSection threads={groups} onSelect={handleSelect} />
      </View>
      <View style={{ marginTop: theme.space.sm }}>
        <DirectSection threads={direct} onSelect={handleSelect} />
      </View>
    </Screen>
  );
}

function groupThreads(threads: MockThread[]) {
  const pinned: MockThread[] = [];
  const groups: MockThread[] = [];
  const direct: MockThread[] = [];

  for (const thread of threads) {
    if (thread.type === 'STELLA') pinned.push(thread);
    else if (thread.type === 'GROUP' || thread.type === 'HANGOUT') groups.push(thread);
    else direct.push(thread);
  }

  return { pinned, groups, direct };
}
