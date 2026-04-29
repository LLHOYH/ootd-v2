// POST /chat/threads/:threadId/messages — append a message to a thread.
//
// SPEC §7.2 (Chat). Validates the body via SendChatMessageBody (handles
// the TEXT-needs-text and non-TEXT-needs-refId superRefine rules), then:
//
//   1. Verifies the requester is a participant — gives a clean 404 vs the
//      RLS-permission-denied surface that an INSERT would otherwise hit.
//   2. Inserts into chat_messages. The 0001_init_schema trigger
//      `chat_messages_touch_thread` keeps chat_threads.last_message_at
//      synced; we do NOT do that here.
//   3. Bumps unread_count for every other participant. Doing this in code
//      keeps the migration simple — a follow-up could move it into a
//      Postgres trigger to remove the round trip.

import { z } from 'zod';
import type { Tables, ChatMessage, ChatMessageKind } from '@mei/types';
import { SendChatMessageBody } from '@mei/types';
import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

type MessageRow = Tables<'chat_messages'>;

const Params = z.object({ threadId: z.string().uuid() });

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

export const sendMessageHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params, body } = validate(
    { params: Params, body: SendChatMessageBody },
    ctx,
  );
  const { threadId } = params;

  // 1. Participant check — explicit lookup so the failure mode is a clean
  //    404 instead of an RLS denial on the INSERT below.
  const { data: meRow, error: meErr } = await supabase
    .from('chat_thread_participants')
    .select('user_id')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (meErr) {
    throw new ApiError(500, 'INTERNAL', meErr.message);
  }
  if (!meRow) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  // 2. Insert the message. The DB-side trigger updates last_message_at.
  const insertRow: {
    thread_id: string;
    sender_id: string;
    kind: ChatMessageKind;
    text?: string | null;
    ref_id?: string | null;
  } = {
    thread_id: threadId,
    sender_id: userId,
    kind: body.kind,
  };
  if (body.text !== undefined) insertRow.text = body.text;
  if (body.refId !== undefined) insertRow.ref_id = body.refId;

  const { data: inserted, error: insertErr } = await supabase
    .from('chat_messages')
    .insert(insertRow)
    .select('message_id, thread_id, sender_id, kind, text, ref_id, created_at')
    .single();
  if (insertErr || !inserted) {
    throw new ApiError(
      500,
      'INTERNAL',
      insertErr?.message ?? 'Failed to insert message',
    );
  }

  // 3. Bump unread_count for everyone else on the thread. Best-effort —
  //    a transient failure here doesn't unwind the message insert (the
  //    follow-up Postgres-trigger improvement noted at the top of this
  //    file removes that asymmetry).
  //
  //    Postgrest doesn't support `unread_count = unread_count + 1` as a
  //    direct update expression; we read-then-write per row, scoped by
  //    thread_id and user_id <> sender. This stays bounded — DM threads
  //    have exactly two participants.
  const { data: othersRows, error: othersErr } = await supabase
    .from('chat_thread_participants')
    .select('user_id, unread_count')
    .eq('thread_id', threadId)
    .neq('user_id', userId);
  if (!othersErr && othersRows) {
    for (const other of othersRows as Pick<
      Tables<'chat_thread_participants'>,
      'user_id' | 'unread_count'
    >[]) {
      await supabase
        .from('chat_thread_participants')
        .update({ unread_count: other.unread_count + 1 })
        .eq('thread_id', threadId)
        .eq('user_id', other.user_id);
    }
  }

  return {
    status: 201,
    body: mapMessage(inserted as MessageRow),
  };
};
