// GET /stella/conversations — list the caller's Stella conversations.
//
// SPEC §7.2. Newest-first by `last_message_at`. The response schema
// (`ListStellaConversationsResponse`) is a flat `{ items: StellaConversation[] }`
// — no cursor — so we return everything the caller can see. RLS already
// scopes the rows to the authenticated user; we still filter on `user_id`
// explicitly so the intent is obvious in the query.

import type { Tables } from '@mei/types';
import type {
  ListStellaConversationsResponse,
  StellaConversation,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';

function rowToApi(row: Tables<'stella_conversations'>): StellaConversation {
  return {
    convoId: row.convo_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

export const listConversationsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  const { data, error } = await supabase
    .from('stella_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false });

  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to list conversations: ${error.message}`,
    );
  }

  const items = (data ?? []).map(rowToApi);
  const responseBody: ListStellaConversationsResponse = { items };

  return { status: 200, body: responseBody };
};
