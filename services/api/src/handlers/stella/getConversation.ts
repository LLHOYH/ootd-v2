// GET /stella/conversations/:convoId — fetch a conversation with its messages.
//
// SPEC §7.2. Returns `{ conversation, messages }` where `messages` are
// ordered oldest-first (chat transcripts are read top-to-bottom). RLS limits
// rows to the caller; we still filter on `user_id` for clarity, and treat a
// missing conversation row as 404 regardless of whether it doesn't exist or
// belongs to someone else (don't leak existence).

import { z } from 'zod';

import type { Tables } from '@mei/types';
import type {
  GetStellaConversationResponse,
  StellaConversation,
  ZStellaMessage,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const ConvoParams = z.object({ convoId: z.string().uuid() });

function convoRowToApi(
  row: Tables<'stella_conversations'>,
): StellaConversation {
  return {
    convoId: row.convo_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

function messageRowToApi(row: Tables<'stella_messages'>): ZStellaMessage {
  // The DB row's `text` is nullable (tool-only messages have no text), but
  // the API contract requires a string. Tool-only rows are an internal
  // implementation detail of the streaming Render service and aren't part of
  // the user-visible transcript shape, so we coalesce to the empty string.
  return {
    messageId: row.message_id,
    convoId: row.convo_id,
    role: row.role,
    text: row.text ?? '',
    createdAt: row.created_at,
  };
}

export const getConversationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: ConvoParams }, ctx);
  const { convoId } = params;

  const { data: convo, error: convoErr } = await supabase
    .from('stella_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('convo_id', convoId)
    .maybeSingle();

  if (convoErr) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to load conversation: ${convoErr.message}`,
    );
  }
  if (!convo) {
    throw new ApiError(404, 'NOT_FOUND', 'Conversation not found');
  }

  const { data: msgRows, error: msgErr } = await supabase
    .from('stella_messages')
    .select('*')
    .eq('convo_id', convoId)
    .order('created_at', { ascending: true });

  if (msgErr) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to load messages: ${msgErr.message}`,
    );
  }

  const responseBody: GetStellaConversationResponse = {
    conversation: convoRowToApi(convo),
    messages: (msgRows ?? []).map(messageRowToApi),
  };

  return { status: 200, body: responseBody };
};
