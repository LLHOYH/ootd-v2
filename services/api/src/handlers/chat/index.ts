// Chat endpoints — see SPEC §7 (Chat). DMs only for P0 (§13.1).
//
// Group / hangout chat creation lives in their own branches; this domain
// only exposes the CRUD that DMs and existing threads need. Real-time
// updates are delivered via Supabase Realtime channels (§7.3) — clients
// subscribe directly; the API just CRUDs.

import type { RouteDef } from '../../router';
import { requireAuth } from '../../middleware/auth';
import { attachSupabaseClient } from '../../index';

import { listThreadsHandler } from './listThreads';
import { getThreadHandler } from './getThread';
import { sendMessageHandler } from './sendMessage';
import { directThreadHandler } from './directThread';
import { markReadHandler } from './markRead';

export const chatRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/chat/threads',
    handler: requireAuth(attachSupabaseClient(listThreadsHandler)),
  },
  {
    method: 'POST',
    path: '/chat/threads/direct',
    handler: requireAuth(attachSupabaseClient(directThreadHandler)),
  },
  {
    method: 'GET',
    path: '/chat/threads/:threadId',
    handler: requireAuth(attachSupabaseClient(getThreadHandler)),
  },
  {
    method: 'POST',
    path: '/chat/threads/:threadId/messages',
    handler: requireAuth(attachSupabaseClient(sendMessageHandler)),
  },
  {
    method: 'POST',
    path: '/chat/threads/:threadId/read',
    handler: requireAuth(attachSupabaseClient(markReadHandler)),
  },
];
