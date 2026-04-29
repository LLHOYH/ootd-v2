// GET /chat/threads/:threadId — thread metadata + paginated messages.
//
// SPEC §7.2 (Chat) + §10.7 (Chat with closet drawer). Messages come back
// newest-first to match the reverse-chronological scroll the chat screen
// renders. Pagination uses the same opaque base64-`{ offset }` cursor
// the mock-server uses (services/mock-server/src/util/paginate.ts), so
// clients can be written against either backend without branching.

import { z } from 'zod';
import type { Tables, ChatThread, ChatThreadType, ChatMessage, ChatMessageKind } from '@mei/types';
import { GetChatThreadQuery } from '@mei/types';
import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

type ThreadRow = Tables<'chat_threads'>;
type ParticipantRow = Tables<'chat_thread_participants'>;
type MessageRow = Tables<'chat_messages'>;

const Params = z.object({ threadId: z.string().uuid() });

interface CursorPayload {
  offset: number;
}

function decodeCursor(cursor: string | undefined): CursorPayload {
  if (!cursor) return { offset: 0 };
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      return { offset: 0 };
    }
    return parsed;
  } catch {
    return { offset: 0 };
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function mapMessage(row: MessageRow): ChatMessage {
  const out: ChatMessage = {
    messageId: row.message_id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    kind: row.kind as ChatMessageKind,
    createdAt: row.created_at,
  };
  if (row.text != null) out.text = row.text;
  if (row.ref_id != null) out.refId = row.ref_id;
  return out;
}

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

export const getThreadHandler: Handler = async (ctx) => {
  const { supabase } = requireAuthCtx(ctx);
  const { params, query } = validate(
    { params: Params, query: GetChatThreadQuery },
    ctx,
  );
  const { threadId } = params;

  // 1. Thread itself. RLS limits this to participants — anything else 404s.
  const { data: threadRow, error: threadErr } = await supabase
    .from('chat_threads')
    .select('thread_id, type, hangout_id, name, last_message_at, created_at')
    .eq('thread_id', threadId)
    .maybeSingle();
  if (threadErr) {
    throw new ApiError(500, 'INTERNAL', threadErr.message);
  }
  if (!threadRow) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }
  const thread = threadRow as ThreadRow;

  // 2. Participants (for participantIds + unreadCounts).
  const { data: participantRows, error: pErr } = await supabase
    .from('chat_thread_participants')
    .select('thread_id, user_id, unread_count, last_read_at')
    .eq('thread_id', threadId);
  if (pErr) {
    throw new ApiError(500, 'INTERNAL', pErr.message);
  }
  const participants = (participantRows ?? []) as ParticipantRow[];
  const participantIds = participants.map((p) => p.user_id);
  const unreadCounts: Record<string, number> = {};
  for (const p of participants) unreadCounts[p.user_id] = p.unread_count;

  // 3. Paginated messages. Newest-first — the chat screen scrolls
  //    reverse-chronologically and pages backward into history.
  const { offset } = decodeCursor(query.cursor);
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const from = offset;
  const to = offset + limit - 1;
  const { data: messageRows, error: mErr } = await supabase
    .from('chat_messages')
    .select('message_id, thread_id, sender_id, kind, text, ref_id, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (mErr) {
    throw new ApiError(500, 'INTERNAL', mErr.message);
  }
  const rows = (messageRows ?? []) as MessageRow[];
  const items = rows.map(mapMessage);
  const nextCursor =
    rows.length === limit ? encodeCursor({ offset: offset + rows.length }) : undefined;

  // 4. Latest message for the ChatThread.lastMessage preview. When the
  //    cursor is at offset 0, the first row of `rows` IS the latest;
  //    otherwise re-query the head row.
  let lastMessage: MessageRow | undefined;
  const head0 = rows[0];
  if (offset === 0 && head0) {
    lastMessage = head0;
  } else if (thread.last_message_at) {
    const { data: head } = await supabase
      .from('chat_messages')
      .select('message_id, thread_id, sender_id, kind, text, ref_id, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (head) lastMessage = head as MessageRow;
  }

  return {
    status: 200,
    body: {
      thread: mapThread(thread, participantIds, unreadCounts, lastMessage),
      messages: nextCursor ? { items, nextCursor } : { items },
    },
  };
};
