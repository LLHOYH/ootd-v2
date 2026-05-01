// Chat detail — SPEC §10.7. One screen, dispatched on `id`:
//   - 'stella' → Stella's pinned thread (still mock-only; SSE wiring is a
//     follow-up in feat/wire-stella-sse).
//   - any other id → real DM / group / hangout thread, backed by
//     useChatThread + Realtime.

import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';

import { StellaChatScreen } from '@/components/stella/StellaChatScreen';
import { Composer } from '@/components/chats/Composer';
import { MessageBubble } from '@/components/chats/MessageBubble';
import { useChatThread } from '@/lib/hooks/useChatThread';
import { useSession } from '@/lib/auth/SessionProvider';

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id === 'stella') {
    return <StellaChatScreen />;
  }
  return <RealThreadScreen threadId={id} />;
}

interface RealThreadScreenProps {
  threadId: string | undefined;
}

function RealThreadScreen({ threadId }: RealThreadScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { state, sendText, refetch, loadOlder } = useChatThread(threadId);
  const listRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive (we use `inverted` so
  // bottom of FlatList = top of data array).
  useEffect(() => {
    if (state.status !== 'success') return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [state]);

  const me = session?.user.id;

  // Compute the screen title from the thread type. For DMs, the inbox
  // already enriched the title — but here we don't have it. Use a generic
  // fallback. (A follow-up could pass the title via expo-router params.)
  const headerTitle = useMemo(() => {
    if (state.status !== 'success') return 'Chat';
    if (state.thread.name) return state.thread.name;
    if (state.thread.type === 'DIRECT') return 'Direct message';
    if (state.thread.type === 'GROUP') return 'Group';
    if (state.thread.type === 'HANGOUT') return 'Hangout';
    return 'Chat';
  }, [state]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        {/* Header */}
        <View
          style={[
            styles.headerRow,
            {
              gap: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              paddingVertical: theme.space.md,
              borderBottomColor: theme.color.border.default,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <ChevronLeft size={24} strokeWidth={1.6} color={theme.color.text.primary} />
          </Pressable>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
            }}
            numberOfLines={1}
          >
            {headerTitle}
          </Text>
        </View>

        {/* Body */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          {state.status === 'loading' || state.status === 'idle' ? (
            <View style={[styles.center]}>
              <ActivityIndicator color={theme.color.brand} />
            </View>
          ) : state.status === 'error' ? (
            <View style={[styles.center, { gap: theme.space.md, padding: theme.space.xxxl }]}>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.body,
                  fontWeight: theme.type.weight.medium as '500',
                  textAlign: 'center',
                }}
              >
                Couldn’t load this chat
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
          ) : (
            <FlatList
              ref={listRef}
              // Render newest at the bottom of the viewport.
              inverted
              data={[...state.messages].reverse()}
              keyExtractor={(m) => m.messageId}
              contentContainerStyle={{
                paddingHorizontal: theme.space.lg,
                paddingVertical: theme.space.md,
              }}
              renderItem={({ item }) => (
                <MessageBubble message={item} fromMe={item.senderId === me} />
              )}
              onEndReached={() => void loadOlder()}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                state.loadingOlder ? (
                  <View style={{ paddingVertical: theme.space.md }}>
                    <ActivityIndicator color={theme.color.brand} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={[styles.center, { paddingTop: theme.space.xxxl }]}>
                  <Text
                    style={{
                      color: theme.color.text.tertiary,
                      fontSize: theme.type.size.tiny,
                      fontWeight: theme.type.weight.regular as '400',
                    }}
                  >
                    Say hi to start the conversation.
                  </Text>
                </View>
              }
            />
          )}

          <Composer
            onSend={async (text) => {
              await sendText(text);
            }}
            disabled={state.status !== 'success'}
          />
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
