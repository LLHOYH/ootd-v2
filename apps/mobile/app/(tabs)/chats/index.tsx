import { StellaChatScreen } from '@/components/stella/StellaChatScreen';

/**
 * Chats tab primary surface.
 *
 * The approved mobile board makes Stella the first-class chat screen rather
 * than an inbox. Real DM/group threads are still handled by /chats/[id].
 */
export default function ChatsScreen() {
  return <StellaChatScreen showBack={false} />;
}
