// Service-role Supabase client for the stylist service.
//
// Mirrors `services/api/src/lib/supabase.ts`: memoised, session persistence
// disabled, bypasses RLS. Stella runs as a privileged backend — RLS would
// only get in the way of the agent loop, and we already check the user's
// JWT at the route boundary (lib/auth.ts).
//
// We don't import from `@mei/api` so this service can be deployed
// independently on Render.

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StylistConfig } from '../config';

let _admin: SupabaseClient | undefined;

export function getSupabaseAdmin(cfg: StylistConfig): SupabaseClient {
  if (!_admin) {
    _admin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _admin;
}

/** Test seam — drops the memoised admin client. */
export function __resetSupabaseForTests(): void {
  _admin = undefined;
}
