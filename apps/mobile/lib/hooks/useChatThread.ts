// useChatThread — open one thread.
//
// Responsibilities:
//   1. Initial fetch (newest-first page).
//   2. Live subscribe to chat_messages via Supabase Realtime so messages
//      from other participants appear without polling.
//   3. Optimistic send: append a TEMP row immediately, replace with the
//      server-acked message on resolve. If the Realtime broadcast beats
//      the POST response (it usually doesn't, but it can), the dedupe key
//      is `messageId`.
//   4. markRead on mount + after each new message arrives, so the inbox
//      unread badge clears.
//   5. Pagination — `loadOlder()` walks the cursor backwards.
//
// Messages are kept in chronological order (oldest → newest) inside the
// hook. The screen renders a `<FlatList inverted>` so newest pins to the
// bottom of the viewport.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatMessageKind, ChatThread, Tables } from '@mei/types';
import { ApiError } from '../api/client';
import {
  fetchChatThread,
  markChatThreadRead,
  sendChatMessage,
} from '../api/chat';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';

interface InternalMessage extends ChatMessage {
  /** Set on optimistic rows; cleared once the server ack lands. */
  pending?: boolean;
  /** Local id for optimistic rows so we can swap them on ack. */
  clientMessageId?: string;
}

export type UseChatThreadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      thread: ChatThread;
      messages: InternalMessage[];
      hasMore: boolean;
      loadingOlder: boolean;
    }
  | { status: 'error'; error: ApiError };

export interface UseChatThreadResult {
  state: UseChatThreadState;
  /** Send a TEXT message (other kinds wait on closet/OOTD wiring). */
  sendText: (text: string) => Promise<void>;
  /** Re-fetch + reset pagination. */
  refetch: () => Promise<void>;
  /** Walk the cursor backwards to load older messages. */
  loadOlder: () => Promise<void>;
}

const PAGE_SIZE = 50;

function rowToMessage(row: Tables<'chat_messages'>): InternalMessage {
  const out: InternalMessage = {
    messageId: row.message_id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    kind: row.kind as ChatMessageKind,
    createdAt: row.created_at,
  };
  if (row.text) out.text = row.text;
  if (row.ref_id) out.refId = row.ref_id;
  return out;
}

/** Insert a message into a sorted array, keeping `createdAt` ascending. */
function insertSorted(arr: InternalMessage[], msg: InternalMessage): InternalMessage[] {
  if (arr.length === 0) return [msg];
  const last = arr[arr.length - 1]!;
  // Hot path: appending newer message.
  if (new Date(msg.createdAt).getTime() >= new Date(last.createdAt).getTime()) {
    return [...arr, msg];
  }
  const next = [...arr, msg];
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return next;
}

export function useChatThread(threadId: string | undefined): UseChatThreadResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseChatThreadState>({ status: 'idle' });
  const cursorRef = useRef<string | undefined>(undefined);
  // Hold a ref to the latest state so callbacks don't capture stale closures.
  const stateRef = useRef<UseChatThreadState>(state);
  stateRef.current = state;

  // ---- Initial fetch ------------------------------------------------------

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!session || !threadId) return;
      setState({ status: 'loading' });
      cursorRef.current = undefined;
      try {
        const res = await fetchChatThread(threadId, { signal, limit: PAGE_SIZE });
        if (signal.aborted) return;

        // Server returns messages newest-first. Reverse for our chronological
        // internal order.
        const ordered = [...res.messages.items].reverse() as InternalMessage[];
        cursorRef.current = res.messages.nextCursor;

        setState({
          status: 'success',
          thread: res.thread,
          messages: ordered,
          hasMore: Boolean(res.messages.nextCursor),
          loadingOlder: false,
        });

        // Mark read on open. Soft-fail — the next message arrival will retry.
        try {
          await markChatThreadRead(threadId, {});
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (signal.aborted) return;
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown');
        setState({ status: 'error', error: apiErr });
      }
    },
    [session, threadId],
  );

  useEffect(() => {
    if (sessionLoading || !session || !threadId) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [session, sessionLoading, threadId, load]);

  // ---- Realtime subscription ---------------------------------------------

  useEffect(() => {
    if (!session || !threadId) return;
    // One channel per open thread. The channel name is per-thread so multiple
    // open threads (rare) don't collide.
    const channel = supabase
      .channel(`chat:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as Tables<'chat_messages'>;
          const incoming = rowToMessage(row);
          setState((prev) => {
            if (prev.status !== 'success') return prev;
            // Dedup against optimistic rows (the sender's own message lands
            // here too via postgres_changes after the upsert acks).
            const exists = prev.messages.some(
              (m) => m.messageId === incoming.messageId,
            );
            if (exists) {
              return {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.messageId === incoming.messageId
                    ? { ...incoming }
                    : m,
                ),
              };
            }
            return { ...prev, messages: insertSorted(prev.messages, incoming) };
          });
          // The arrival came from another participant → mark read so the
          // unread badge in the inbox clears. Best-effort; ignore errors.
          if (row.sender_id !== session.user.id) {
            void markChatThreadRead(threadId, {}).catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, threadId]);

  // ---- Mutations ----------------------------------------------------------

  const sendText = useCallback(
    async (text: string): Promise<void> => {
      if (!threadId || !session) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const clientMessageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: InternalMessage = {
        messageId: clientMessageId, // replaced on server ack
        clientMessageId,
        threadId,
        senderId: session.user.id,
        kind: 'TEXT',
        text: trimmed,
        createdAt: new Date().toISOString(),
        pending: true,
      };

      setState((prev) =>
        prev.status === 'success'
          ? { ...prev, messages: [...prev.messages, optimistic] }
          : prev,
      );

      try {
        const acked = await sendChatMessage(threadId, {
          kind: 'TEXT',
          text: trimmed,
          clientMessageId,
        });
        setState((prev) => {
          if (prev.status !== 'success') return prev;
          // Replace the optimistic row in place.
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.clientMessageId === clientMessageId
                ? { ...rowToMessage({
                    message_id: acked.messageId,
                    thread_id: acked.threadId,
                    sender_id: acked.senderId,
                    kind: acked.kind,
                    text: acked.text ?? null,
                    ref_id: acked.refId ?? null,
                    created_at: acked.createdAt,
                  } as Tables<'chat_messages'>) }
                : m,
            ),
          };
        });
      } catch (err) {
        // Remove the optimistic row on failure; the screen surfaces the
        // error via a toast or status from caller-side state.
        setState((prev) => {
          if (prev.status !== 'success') return prev;
          return {
            ...prev,
            messages: prev.messages.filter((m) => m.clientMessageId !== clientMessageId),
          };
        });
        throw err;
      }
    },
    [threadId, session],
  );

  const refetch = useCallback(async () => {
    if (!threadId) return;
    const ctrl = new AbortController();
    await load(ctrl.signal);
  }, [threadId, load]);

  const loadOlder = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.status !== 'success' || !cur.hasMore || cur.loadingOlder) return;
    if (!threadId) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    setState({ ...cur, loadingOlder: true });
    try {
      const res = await fetchChatThread(threadId, { cursor, limit: PAGE_SIZE });
      const olderAsc = [...res.messages.items].reverse() as InternalMessage[];
      cursorRef.current = res.messages.nextCursor;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          messages: [...olderAsc, ...prev.messages],
          hasMore: Boolean(res.messages.nextCursor),
          loadingOlder: false,
        };
      });
    } catch {
      setState((prev) =>
        prev.status === 'success' ? { ...prev, loadingOlder: false } : prev,
      );
    }
  }, [threadId]);

  return { state, sendText, refetch, loadOlder };
}
