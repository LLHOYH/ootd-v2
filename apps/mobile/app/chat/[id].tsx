import { useLocalSearchParams } from 'expo-router';
import { Placeholder } from '@/components/Placeholder';
import { StellaChatScreen } from '@/components/stella/StellaChatScreen';

/**
 * Chat detail. One screen, dispatched on `id`:
 * - `stella` → Stella's pinned thread (SPEC §10.5).
 * - any other id → regular chat detail placeholder (SPEC §10.7).
 */
export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (id === 'stella') {
    return <StellaChatScreen />;
  }

  return (
    <Placeholder
      title="Chat"
      subtitle={id ? `Thread: ${id}` : 'Thread'}
      mockupLabel="CHAT · SEND FROM CLOSET"
    />
  );
}
