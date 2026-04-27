import { Stack } from 'expo-router';

/**
 * Stack inside the Chats tab so that pushing to chat detail
 * (`/chats/[id]`) preserves the bottom tab bar with Chats highlighted.
 * Per docs/CHANGES.md changeset 01 test checklist.
 */
export default function ChatsTabLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
