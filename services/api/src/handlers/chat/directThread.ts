// POST /chat/threads/direct — find-or-create a DM thread.
//
// SPEC §7.2 (Chat). Idempotent: if a 1-on-1 DIRECT thread already exists
// between the caller and `withUserId`, return it; otherwise create it.
//
// Reachability: §12.5 says a user is reachable when they're either
// `discoverable` OR friends with the requester. RLS on the `users` table
// enforces this on the SELECT below — if the row comes back, the target
// is reachable. No row → 404.
//
// Concurrency: Supabase JS doesn't expose first-class transactions. The
// race window is "two requests create the same DM at once". We accept a
// small risk; a follow-up could add a unique partial index on
// (least(a,b), greatest(a,b)) where type = 'DIRECT' and resolve via the
// duplicate-key error.

import type { Tables, ChatThread } from '@mei/types';
import { CreateDirectThreadBody } from '@mei/types';
import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

type ThreadRow = Tables<'chat_threads'>;
type ParticipantRow = Tables<'chat_thread_participants'>;

function mapThread(
  row: ThreadRow,
  participantIds: string[],
  unreadCounts: Record<string, number>,
): ChatThread {
  const thread: ChatThread = {
    threadId: row.thread_id,
    type: 'DIRECT',
    participantIds,
    unreadCounts,
    createdAt: row.created_at,
  };
  if (row.name) thread.name = row.name;
  return thread;
}

export const directThreadHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateDirectThreadBody }, ctx);
  const { withUserId } = body;

  if (withUserId === userId) {
    throw new ApiError(400, 'INVALID', 'Cannot DM yourself');
  }

  // Reachability check via RLS on `users`. If the row isn't returned, the
  // target isn't discoverable AND isn't a friend of the requester.
  const { data: targetRow, error: targetErr } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', withUserId)
    .maybeSingle();
  if (targetErr) {
    throw new ApiError(500, 'INTERNAL', targetErr.message);
  }
  if (!targetRow) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found or not reachable');
  }

  // Find an existing 1:1 DM. Strategy: list all DIRECT threads the
  // requester participates in, then keep the one whose other participant
  // is `withUserId` AND that has exactly two participants.
  const { data: myDirect, error: myErr } = await supabase
    .from('chat_threads')
    .select('thread_id, type, hangout_id, name, last_message_at, created_at')
    .eq('type', 'DIRECT');
  if (myErr) {
    throw new ApiError(500, 'INTERNAL', myErr.message);
  }
  const candidates = (myDirect ?? []) as ThreadRow[];

  if (candidates.length > 0) {
    const candidateIds = candidates.map((c) => c.thread_id);
    const { data: pRows, error: pErr } = await supabase
      .from('chat_thread_participants')
      .select('thread_id, user_id, unread_count, last_read_at')
      .in('thread_id', candidateIds);
    if (pErr) {
      throw new ApiError(500, 'INTERNAL', pErr.message);
    }
    const participantsByThread = new Map<string, ParticipantRow[]>();
    for (const p of (pRows ?? []) as ParticipantRow[]) {
      const arr = participantsByThread.get(p.thread_id) ?? [];
      arr.push(p);
      participantsByThread.set(p.thread_id, arr);
    }
    for (const t of candidates) {
      const ps = participantsByThread.get(t.thread_id) ?? [];
      if (ps.length !== 2) continue;
      const ids = ps.map((p) => p.user_id);
      if (ids.includes(userId) && ids.includes(withUserId)) {
        const unreadCounts: Record<string, number> = {};
        for (const p of ps) unreadCounts[p.user_id] = p.unread_count;
        return {
          status: 200,
          body: { thread: mapThread(t, ids, unreadCounts), created: false },
        };
      }
    }
  }

  // Create the thread + two participant rows. Two queries; if the
  // participant insert fails the thread row stays as a stranded shell
  // — acceptable for now; a follow-up Postgres function with an
  // explicit transaction is the cleaner long-term fix.
  const { data: newThread, error: createErr } = await supabase
    .from('chat_threads')
    .insert({ type: 'DIRECT' })
    .select('thread_id, type, hangout_id, name, last_message_at, created_at')
    .single();
  if (createErr || !newThread) {
    throw new ApiError(
      500,
      'INTERNAL',
      createErr?.message ?? 'Failed to create thread',
    );
  }
  const threadRow = newThread as ThreadRow;

  const { error: partErr } = await supabase
    .from('chat_thread_participants')
    .insert([
      { thread_id: threadRow.thread_id, user_id: userId, unread_count: 0 },
      { thread_id: threadRow.thread_id, user_id: withUserId, unread_count: 0 },
    ]);
  if (partErr) {
    throw new ApiError(500, 'INTERNAL', partErr.message);
  }

  return {
    status: 201,
    body: {
      thread: mapThread(
        threadRow,
        [userId, withUserId],
        { [userId]: 0, [withUserId]: 0 },
      ),
      created: true,
    },
  };
};
