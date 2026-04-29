// Server-side Supabase clients.
//
// Two flavours:
//
//   getSupabaseAdmin()
//     Memoised service-role client. Bypasses RLS entirely. Use from admin
//     paths: image-worker promotion, notifier fan-out, anything that has
//     to act on behalf of multiple users in one breath. Never accept a
//     userId argument and skip the RLS check elsewhere — that's how we
//     end up shipping IDORs.
//
//   getSupabaseFor(jwt)
//     Per-request client minted with the user's bearer token. RLS evaluates
//     `auth.uid()` to the JWT's `sub`, so the same query that returns the
//     caller's closet items returns nothing for a different caller. This
//     is the default for all user-facing endpoints. Per-request because the
//     SDK keeps the token internally; sharing instances would leak access
//     across requests in a warm Lambda container.
//
// Both clients disable session persistence — the API is stateless, there's
// nothing to persist.

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let _admin: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _admin;
}

export function getSupabaseFor(jwt: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });
}

/** Test seam — drops the memoised admin client. */
export function __resetSupabaseForTests(): void {
  _admin = undefined;
}
