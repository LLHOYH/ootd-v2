// POST /stella/conversations — start a new Stella conversation.
//
// SPEC §7.2 "Stella" + §13.1 P0. The streaming send-message route lives on
// the Render container at services/stylist; this Lambda only owns the
// CRUD-shaped surface.
//
// Body (CreateStellaConversationBody):
//   { title?: string; seedMessage?: string; occasion?: Occasion }
// Response (CreateStellaConversationResponse):
//   { convoId: string; conversation: StellaConversation }
//
// We let Postgres mint `convo_id` (uuid default) and the timestamp defaults.
// `seedMessage` and `occasion` are accepted by the schema but not persisted
// here — those are the Render service's concern when it actually drives the
// agent. Storing them blindly would either duplicate the user message that
// the streaming endpoint will write, or pollute the conversation row with
// state that has no column. The spec ambiguity is resolved by treating this
// endpoint as pure metadata creation; the first turn (if any) flows through
// the streaming endpoint.

import type { Tables } from '@mei/types';
import {
  CreateStellaConversationBody,
  type CreateStellaConversationResponse,
  type StellaConversation,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

function rowToApi(row: Tables<'stella_conversations'>): StellaConversation {
  return {
    convoId: row.convo_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

export const createConversationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateStellaConversationBody }, ctx);

  // The schema allows the whole body to be omitted — `body` may be undefined.
  const title = body?.title ?? 'New conversation';

  const { data, error } = await supabase
    .from('stella_conversations')
    .insert({ user_id: userId, title })
    .select('*')
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to create conversation: ${error?.message ?? 'no row returned'}`,
    );
  }

  const conversation = rowToApi(data);
  const responseBody: CreateStellaConversationResponse = {
    convoId: conversation.convoId,
    conversation,
  };

  return { status: 201, body: responseBody };
};
