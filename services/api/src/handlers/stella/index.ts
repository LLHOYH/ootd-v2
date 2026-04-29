// Stella endpoints — see SPEC §7 (Stella).
//
// Most of Stella's surface is served by the Render container at
// services/stylist (POST /stella/conversations/:id/messages streams SSE).
// The api Lambda owns the non-streaming routes:
//   - POST   /stella/conversations            (create)
//   - GET    /stella/conversations            (list)
//   - GET    /stella/conversations/:convoId   (detail)
//   - DELETE /stella/conversations/:convoId
//
// The streaming route is intentionally NOT registered here — that lives on
// the Render service which can hold a long-running connection without
// fighting API Gateway's response-size + timeout limits.

import type { Handler } from '../../context';
import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';

import { createConversationHandler } from './createConversation';
import { deleteConversationHandler } from './deleteConversation';
import { getConversationHandler } from './getConversation';
import { listConversationsHandler } from './listConversations';

const wrap = (h: Handler): Handler => requireAuth(attachSupabaseClient(h));

export const stellaRoutes: RouteDef[] = [
  {
    method: 'POST',
    path: '/stella/conversations',
    handler: wrap(createConversationHandler),
  },
  {
    method: 'GET',
    path: '/stella/conversations',
    handler: wrap(listConversationsHandler),
  },
  {
    method: 'GET',
    path: '/stella/conversations/:convoId',
    handler: wrap(getConversationHandler),
  },
  {
    method: 'DELETE',
    path: '/stella/conversations/:convoId',
    handler: wrap(deleteConversationHandler),
  },
];
