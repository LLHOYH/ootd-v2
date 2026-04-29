// POST /chat/threads/:threadId/read — mark thread as read for the caller.
//
// SPEC §7.2 (Chat). Sets `unread_count = 0` and `last_read_at = now()`
// on the requester's chat_thread_participants row. Returns the updated
// `unreadCount` per `MarkThreadReadResponse`.
//
// `upToMessageId` is accepted (per the schema) but ignored in this
// pass — the inbox treats a thread as either fully read or not. A
// future iteration can use it to set `last_read_at` to that message's
// `created_at` instead of `now()`.

import { z } from 'zod';
import type { Tables } from '@mei/types';
import { MarkThreadReadBody } from '@mei/types';
import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ threadId: z.string().uuid() });

export const markReadHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate(
    { params: Params, body: MarkThreadReadBody },
    ctx,
  );
  const { threadId } = params;

  // Update + return the (now zero) row. RLS gate: the WHERE clause must
  // match a row the caller is allowed to see, i.e. their own participant
  // row — anything else returns no rows and we 404.
  const { data, error } = await supabase
    .from('chat_thread_participants')
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .select('thread_id, user_id, unread_count, last_read_at')
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'INTERNAL', error.message);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }
  const row = data as Tables<'chat_thread_participants'>;

  return {
    status: 200,
    body: {
      threadId: row.thread_id,
      unreadCount: row.unread_count,
    },
  };
};
