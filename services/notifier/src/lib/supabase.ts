// Service-role Supabase client for the notifier.
//
// Reads `push_tokens` for arbitrary users (RLS would otherwise gate it
// to the caller's own tokens). The notifier never serves user-scoped
// requests, so service-role is the only client it ever needs.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NotifierConfig } from '../config';

let _admin: SupabaseClient | undefined;

export function getSupabaseAdmin(cfg: NotifierConfig): SupabaseClient {
  if (!_admin) {
    _admin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export function __resetSupabaseForTests(): void {
  _admin = undefined;
}
