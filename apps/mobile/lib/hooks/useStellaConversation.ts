// useStellaConversation — pinned single Stella thread per user (SPEC §10.6).
//
// Behaviour:
//   1. On mount, list the caller's conversations and adopt the most-recent
//      one. If none exist, create a fresh one (still empty until the first
//      send). Either way we have a `convoId` for the rest of the session.
//   2. Render the conversation's persisted messages in chronological order.
//   3. `send(text)` does the optimistic-user / streaming-assistant dance:
//        a. append a USER message marked pending → flush to UI immediately
//        b. POST to stylist's SSE endpoint
//        c. for each `text_delta`, append to a streaming ASSISTANT message
//        d. on `message_stop` / `[DONE]`, lock the assistant message in
//           place (it's now persisted server-side; the next refetch would
//           see the same content)
//   4. tool_call events are surfaced as a transient "thinking" hint via
//      the `assistantStatus` field; we don't render the tool input/output
//      yet (that's feat/wire-stella-tools once closet/OOTD wiring lands).

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  StellaConversation,
  StellaSseEvent,
  ZStellaMessage,
} from '@mei/types';
import { ApiError } from '../api/client';
import {
  createStellaConversation,
  getStellaConversation,
  listStellaConversations,
  streamStellaMessage,
} from '../api/stella';
import { useSession } from '../auth/SessionProvider';

/** A message in the live UI. May be persisted (no `pending`) or in-flight. */
export interface StellaUiMessage extends ZStellaMessage {
  /** True for an optimistic user row or an in-flight assistant stream. */
  pending?: boolean;
  /**
   * For pending assistant rows: caller-side id, replaced when message_stop
   * arrives. Used to dedupe against the persisted row on refetch.
   */
  clientStreamId?: string;
}

export type UseStellaConversationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      conversation: StellaConversation;
      messages: StellaUiMessage[];
      /** Tool name if Stella is currently tool-calling, else undefined. */
      assistantStatus?: string;
      /** True while a user→assistant cycle is in flight. */
      sending: boolean;
    }
  | { status: 'error'; error: ApiError };

export interface UseStellaConversationResult {
  state: UseStellaConversationState;
  send: (text: string) => Promise<void>;
  refetch: () => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useStellaConversation(): UseStellaConversationResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseStellaConversationState>({ status: 'idle' });
  const stateRef = useRef<UseStellaConversationState>(state);
  stateRef.current = state;

  // ---- Bootstrap: list → adopt or create -----------------------------------

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!session) return;
      setState({ status: 'loading' });
      try {
        const list = await listStellaConversations({ signal });
        if (signal.aborted) return;

        let convoId: string;
        if (list.items.length > 0) {
          // List is sorted by lastMessageAt desc — adopt the newest.
          convoId = list.items[0]!.convoId;
        } else {
          const created = await createStellaConversation({}, { signal });
          if (signal.aborted) return;
          convoId = created.convoId;
        }

        const detail = await getStellaConversation(convoId, { signal });
        if (signal.aborted) return;
        setState({
          status: 'success',
          conversation: detail.conversation,
          messages: detail.messages.map((m) => ({ ...m })),
          sending: false,
        });
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        setState({ status: 'error', error: apiErr });
      }
    },
    [session],
  );

  useEffect(() => {
    if (sessionLoading || !session) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [session, sessionLoading, load]);

  const refetch = useCallback(async () => {
    const ctrl = new AbortController();
    await load(ctrl.signal);
  }, [load]);

  // ---- Send + stream -------------------------------------------------------

  const send = useCallback(
    async (text: string): Promise<void> => {
      const cur = stateRef.current;
      if (cur.status !== 'success') return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const userClientId = genId('user');
      const streamClientId = genId('stream');

      // Append optimistic user row immediately.
      const optimisticUser: StellaUiMessage = {
        messageId: userClientId,
        convoId: cur.conversation.convoId,
        role: 'USER',
        text: trimmed,
        createdAt: nowIso(),
        pending: true,
      };
      // Append a pending streaming assistant row that fills as deltas land.
      const streamingAssistant: StellaUiMessage = {
        messageId: streamClientId,
        convoId: cur.conversation.convoId,
        role: 'ASSISTANT',
        text: '',
        createdAt: nowIso(),
        pending: true,
        clientStreamId: streamClientId,
      };

      setState({
        ...cur,
        messages: [...cur.messages, optimisticUser, streamingAssistant],
        sending: true,
        assistantStatus: undefined,
      });

      const ctrl = new AbortController();
      try {
        await streamStellaMessage(
          cur.conversation.convoId,
          { text: trimmed, clientMessageId: userClientId },
          {
            onEvent: (ev: StellaSseEvent) => {
              setState((prev) => {
                if (prev.status !== 'success') return prev;
                if (ev.event === 'text_delta') {
                  return {
                    ...prev,
                    assistantStatus: undefined,
                    messages: prev.messages.map((m) =>
                      m.clientStreamId === streamClientId
                        ? { ...m, text: (m.text ?? '') + ev.delta }
                        : m,
                    ),
                  };
                }
                if (ev.event === 'tool_call') {
                  return { ...prev, assistantStatus: `running ${ev.name}…` };
                }
                if (ev.event === 'message_start') {
                  // Replace the placeholder messageId with the server's id
                  // so future refetches dedupe cleanly.
                  return {
                    ...prev,
                    messages: prev.messages.map((m) =>
                      m.clientStreamId === streamClientId
                        ? { ...m, messageId: ev.messageId }
                        : m,
                    ),
                  };
                }
                if (ev.event === 'error') {
                  return {
                    ...prev,
                    messages: prev.messages.map((m) =>
                      m.clientStreamId === streamClientId
                        ? { ...m, text: `(stella ran into an issue: ${ev.message})` }
                        : m,
                    ),
                  };
                }
                // message_stop: nothing more to apply; clearing handled by onDone.
                return prev;
              });
            },
            onDone: () => {
              setState((prev) => {
                if (prev.status !== 'success') return prev;
                return {
                  ...prev,
                  sending: false,
                  assistantStatus: undefined,
                  messages: prev.messages.map((m) => {
                    // Promote pending rows to settled. The user row's messageId
                    // is still client-side; the next refetch will reconcile.
                    if (m.messageId === userClientId)
                      return { ...m, pending: false };
                    if (m.clientStreamId === streamClientId)
                      return { ...m, pending: false };
                    return m;
                  }),
                };
              });
              // Refetch in the background so the persisted server-side ids
              // replace our optimistic rows. Soft-fail.
              void refetch().catch(() => {});
            },
            onError: (err) => {
              // Surface the error inline on the assistant bubble; keep the
              // user message so they can retry.
              setState((prev) => {
                if (prev.status !== 'success') return prev;
                return {
                  ...prev,
                  sending: false,
                  assistantStatus: undefined,
                  messages: prev.messages.map((m) =>
                    m.clientStreamId === streamClientId
                      ? { ...m, text: `(connection issue: ${err.message})`, pending: false }
                      : m.messageId === userClientId
                        ? { ...m, pending: false }
                        : m,
                  ),
                };
              });
            },
          },
          { signal: ctrl.signal },
        );
      } catch (err) {
        // streamStellaMessage throws on transport / non-2xx. Replace the
        // streaming row with an error placeholder.
        setState((prev) => {
          if (prev.status !== 'success') return prev;
          const msg = err instanceof Error ? err.message : 'Send failed';
          return {
            ...prev,
            sending: false,
            assistantStatus: undefined,
            messages: prev.messages.map((m) =>
              m.clientStreamId === streamClientId
                ? { ...m, text: `(send failed: ${msg})`, pending: false }
                : m.messageId === userClientId
                  ? { ...m, pending: false }
                  : m,
            ),
          };
        });
      }
    },
    [refetch],
  );

  return { state, send, refetch };
}
