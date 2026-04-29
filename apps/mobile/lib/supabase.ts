// Mobile Supabase client.
//
// Uses Expo's `EXPO_PUBLIC_*` env convention so values are inlined into the
// JS bundle at build time — there's no server to read them at runtime. The
// anon key is safe to ship: row-level security in 0002_rls_policies.sql is
// what enforces access, the anon key just opens the door.
//
// Storage is MMKV (see mmkvStorage.ts) — synchronous + encrypted, faster
// than async-storage. detectSessionInUrl is off because RN has no URL bar;
// expo-router handles deep links explicitly elsewhere.

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { mmkvStorage } from './auth/mmkvStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Throw at import time rather than letting downstream calls fail with a
  // confusing 401 — the caller forgot to copy `.env.example` to `.env`.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values ' +
      'from `supabase status`.',
  );
}

export const supabase = createClient(url, anon, {
  auth: {
    storage: mmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
