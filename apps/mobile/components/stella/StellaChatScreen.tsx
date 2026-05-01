import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, useTheme } from '@mei/ui';

import { StellaHeader } from './Header';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useStellaConversation } from '@/lib/hooks/useStellaConversation';

/**
 * Stella chat — SPEC §10.5. Pinned conversation per user.
 *
 * One hook drives everything: bootstraps the conversation (list → adopt
 * newest, or create), renders persisted messages, streams new replies via
 * the stylist Render service. Tool-call events surface as a transient
 * `assistantStatus` line; rich card rendering lands in feat/wire-stella-tools.
 */
export function StellaChatScreen() {
  const theme = useTheme();
  const { state, send } = useStellaConversation();

  return (
    <Screen>
      <View style={[styles.container, { gap: theme.space.sm }]}>
        <StellaHeader />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          {state.status === 'idle' || state.status === 'loading' ? (
            <View style={styles.center}>
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
                Couldn’t reach Stella
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
            </View>
          ) : (
            <>
              <MessageList
                messages={state.messages}
                assistantStatus={state.assistantStatus}
              />
              <View style={{ paddingBottom: theme.space.md }}>
                <Composer onSend={send} disabled={state.sending} />
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
