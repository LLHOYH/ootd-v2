import { useLocalSearchParams } from 'expo-router';
import { Placeholder } from '@/components/Placeholder';

/**
 * Chat detail — placeholder. Real chat UI lands later (SPEC §10.7).
 * The Chats inbox pushes here on row tap.
 */
export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder
      title="Chat"
      subtitle={id ? `Thread: ${id}` : 'Thread'}
      mockupLabel="CHAT · SEND FROM CLOSET"
    />
  );
}
