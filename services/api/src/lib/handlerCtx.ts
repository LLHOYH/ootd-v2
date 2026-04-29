// Handler context narrowing for authenticated business handlers.
//
// `requireAuth` (middleware/auth.ts) populates `ctx.userId` + `ctx.accessToken`,
// and the dispatcher attaches a per-request `ctx.supabase` after auth runs.
// Once those are in place, `requireAuthCtx(ctx)` extracts the typed pair every
// authed handler actually needs, throwing 401 on the developer-error path
// where the middleware was forgotten.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestContext } from '../context';
import { ApiError } from '../errors';

/**
 * Narrow ctx for a handler that requires an authenticated request.
 * Throws 401 if the auth middleware didn't run (developer error).
 */
export function requireAuthCtx(ctx: RequestContext): {
  userId: string;
  supabase: SupabaseClient;
} {
  if (!ctx.userId || !ctx.supabase) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authenticated context required');
  }
  return { userId: ctx.userId, supabase: ctx.supabase };
}
