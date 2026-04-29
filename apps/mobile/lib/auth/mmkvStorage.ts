// MMKV-backed storage adapter for `@supabase/supabase-js`.
//
// Supabase's auth client expects a `getItem` / `setItem` / `removeItem`
// trio (the localStorage shape). Async-Storage works on RN but is the slow
// path; MMKV is synchronous, encrypted, and already pulled in per
// SPEC.md §3.1, so we adapt it directly. The supabase types accept either
// sync or async returns — we expose async to keep the surface area
// uniform with the rest of the codebase.
//
// `id` namespaces the storage instance so future MMKV consumers (e.g. a
// settings cache) don't collide with auth tokens.

import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'mei-auth' });

export const mmkvStorage = {
  getItem: (key: string): string | null => {
    const value = storage.getString(key);
    return value ?? null;
  },
  setItem: (key: string, value: string): void => {
    storage.set(key, value);
  },
  removeItem: (key: string): void => {
    storage.delete(key);
  },
};
