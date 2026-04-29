// GET /chat/threads — inbox for the current user.
//
// SPEC §7.2 (Chat) + §10.6 (Chats inbox). Threads are split into four
// sections — pinned (Stella), groups, hangouts, and direct (DMs) — to
// match `ListChatThreadsResponse` in @mei/types/contracts/chat.
//
// We rely on RLS for participant-only access (the SELECT-via-participant
// policy on chat_threads). Within a single round-trip we also need:
//   1. The thread row.
//   2. The set of participant userIds for that thread (for ChatThread.participantIds
//      + the unreadCounts map).
//   3. The latest chat_messages row per thread (for ChatThread.lastMessage).
//
// Postgrest doesn't have window-functions on a nested select, so we
// fan out: one query for threads, one for the requester's participant
// rows + sibling rows, one for "latest message per visible thread".
// All three queries are RLS-scoped, so the join surface stays consistent
// with what the caller is allowed to see.

import type { Tables, ChatThread, ChatThreadType } from '@mei/types';
import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';

type ThreadRow = Tables<'chat_threads'>;
type ParticipantRow = Tables<'chat_thread_participants'>;
type MessageRow = Tables<'chat_messages'>;

function mapThread(
  row: ThreadRow,
  participantIds: string[],
  unreadCounts: Record<string, number>,
  lastMessage: MessageRow | undefined,
): ChatThread {
  const thread: ChatThread = {
    threadId: row.thread_id,
    type: row.type as ChatThreadType,
    participantIds,
    unreadCounts,
    createdAt: row.created_at,
  };
  if (row.hangout_id) thread.hangoutId = row.hangout_id;
  if (row.name) thread.name = row.name;
  if (lastMessage) {
    const preview =
      lastMessage.kind === 'TEXT' && lastMessage.text
        ? lastMessage.text.slice(0, 80)
        : `[${lastMessage.kind.toLowerCase()}]`;
    thread.lastMessage = {
      preview,
      at: lastMessage.created_at,
      senderId: lastMessage.sender_id,
    };
  }
  return thread;
}

export const listThreadsHandler: Handler = async (ctx) => {
  const { supabase } = requireAuthCtx(ctx);

  // 1. Fetch every thread the requester is allowed to see (RLS = participant-only).
  //    Order by last_message_at desc so each section ends up sorted by recency.
  const { data: threadRows, error: threadsErr } = await supabase
    .from('chat_threads')
    .select('thread_id, type, hangout_id, name, last_message_at, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (threadsErr) {
    throw new ApiError(500, 'INTERNAL', threadsErr.message);
  }
  const threads = (threadRows ?? []) as ThreadRow[];
  if (threads.length === 0) {
    return {
      status: 200,
      body: { pinned: [], groups: [], hangouts: [], direct: [] },
    };
  }

  const threadIds = threads.map((t) => t.thread_id);

  // 2. All participant rows for the visible threads — RLS keeps this
  //    consistent with what the caller can see.
  const { data: participantRows, error: pErr } = await supabase
    .from('chat_thread_participants')
    .select('thread_id, user_id, unread_count, last_read_at')
    .in('thread_id', threadIds);
  if (pErr) {
    throw new ApiError(500, 'INTERNAL', pErr.message);
  }
  const participants = (participantRows ?? []) as ParticipantRow[];

  // 3. Latest message per thread. Fetch a bounded slice ordered by
  //    created_at desc; we scan client-side and pick the first per thread.
  //    For a small inbox this is fine; for very chatty threads the trigger
  //    that maintains last_message_at gives us a fast bound on the lookup.
  const { data: messageRows, error: mErr } = await supabase
    .from('chat_messages')
    .select('message_id, thread_id, sender_id, kind, text, ref_id, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })
    .limit(threadIds.length * 5);
  if (mErr) {
    throw new ApiError(500, 'INTERNAL', mErr.message);
  }
  const messages = (messageRows ?? []) as MessageRow[];

  // Build per-thread maps.
  const participantsByThread = new Map<string, ParticipantRow[]>();
  for (const p of participants) {
    const arr = participantsByThread.get(p.thread_id) ?? [];
    arr.push(p);
    participantsByThread.set(p.thread_id, arr);
  }
  const lastMessageByThread = new Map<string, MessageRow>();
  for (const m of messages) {
    if (!lastMessageByThread.has(m.thread_id)) {
      lastMessageByThread.set(m.thread_id, m);
    }
  }

  const pinned: ChatThread[] = [];
  const groups: ChatThread[] = [];
  const hangouts: ChatThread[] = [];
  const direct: ChatThread[] = [];

  for (const t of threads) {
    const ps = participantsByThread.get(t.thread_id) ?? [];
    const participantIds = ps.map((p) => p.user_id);
    const unreadCounts: Record<string, number> = {};
    for (const p of ps) unreadCounts[p.user_id] = p.unread_count;
    const lastMessage = lastMessageByThread.get(t.thread_id);
    const mapped = mapThread(t, participantIds, unreadCounts, lastMessage);
    switch (t.type) {
      case 'STELLA':
        pinned.push(mapped);
        break;
      case 'GROUP':
        groups.push(mapped);
        break;
      case 'HANGOUT':
        hangouts.push(mapped);
        break;
      case 'DIRECT':
        direct.push(mapped);
        break;
    }
  }

  return {
    status: 200,
    body: { pinned, groups, hangouts, direct },
  };
};
