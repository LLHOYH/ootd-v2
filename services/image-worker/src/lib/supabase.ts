// Service-role Supabase client for the image-worker.
//
// All bucket reads/writes here legitimately need to bypass RLS:
//   - Read raw uploads from `closet-raw` (owner-only RLS would otherwise
//     gate the worker out — the worker isn't the owner).
//   - Write tuned + thumbnail to `closet-tuned` (worker writes; users read).
//   - Update `closet_items` rows to flip status PROCESSING → READY.
//
// The service-role key never leaves this Lambda. Mobile clients only ever
// see the anon key (or a user-scoped JWT).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ImageWorkerConfig } from '../config';

let _admin: SupabaseClient | undefined;

export function getSupabaseAdmin(cfg: ImageWorkerConfig): SupabaseClient {
  if (!_admin) {
    _admin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Test seam — drop the memoised client. */
export function __resetSupabaseForTests(): void {
  _admin = undefined;
}
