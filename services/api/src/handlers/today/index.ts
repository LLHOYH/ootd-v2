// Today endpoints — see SPEC §7.2 (Today). Filled in by feat/today-api.
//
// Handler composition: `requireAuth(attachSupabaseClient(handler))`.
//   - `requireAuth` verifies the Supabase JWT and sets `ctx.userId` +
//     `ctx.accessToken` (middleware/auth.ts).
//   - `attachSupabaseClient` mints a per-request RLS-scoped client off
//     the bearer token (services/api/src/index.ts).
// The dispatcher in services/api/src/index.ts ALSO re-wraps every route
// with `attachSupabaseClient` as a safety net; that wrapper is
// idempotent (`if (ctx.accessToken && !ctx.supabase)`), so registering
// the inner wrap explicitly here costs us nothing and matches the
// pattern the rest of the codebase uses verbatim.

import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';
import { anotherPickHandler } from './anotherPick';
import { communityLooksHandler } from './communityLooks';
import { getTodayHandler } from './getToday';

export const todayRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/today',
    handler: requireAuth(attachSupabaseClient(getTodayHandler)),
  },
  {
    method: 'POST',
    path: '/today/another-pick',
    handler: requireAuth(attachSupabaseClient(anotherPickHandler)),
  },
  {
    method: 'GET',
    path: '/today/community-looks',
    handler: requireAuth(attachSupabaseClient(communityLooksHandler)),
  },
];
