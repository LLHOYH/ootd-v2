// DELETE /stella/conversations/:convoId — remove a conversation + transcript.
//
// SPEC §7.2. RLS prevents deleting another user's conversation; the
// `on delete cascade` on `stella_messages.convo_id` (migration 0001) takes
// care of the message rows. We use `select('convo_id')` after the delete so
// we can detect the "no row was deleted" case and return 404 instead of the
// silent 200 the supabase client would otherwise produce.

import { z } from 'zod';

import type { DeleteStellaConversationResponse } from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const ConvoParams = z.object({ convoId: z.string().uuid() });

export const deleteConversationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: ConvoParams }, ctx);
  const { convoId } = params;

  const { data, error } = await supabase
    .from('stella_conversations')
    .delete()
    .eq('user_id', userId)
    .eq('convo_id', convoId)
    .select('convo_id');

  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to delete conversation: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Conversation not found');
  }

  const responseBody: DeleteStellaConversationResponse = {};
  return { status: 200, body: responseBody };
};
