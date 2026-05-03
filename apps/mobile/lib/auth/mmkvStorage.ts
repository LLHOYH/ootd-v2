// AsyncStorage-backed adapter for `@supabase/supabase-js`.
//
// Originally backed by react-native-mmkv (synchronous + encrypted), but
// mmkv 3.x requires TurboModules and isn't bundled in Expo Go — every
// route blew up at module load with "react-native-mmkv 3.x.x requires
// TurboModules, but the new architecture is not enabled". AsyncStorage
// IS bundled in Expo Go, so we swap to it for now.
//
// File and export name kept so we don't churn imports across the app.
// When we move to a custom dev client / EAS build we can revisit and
// switch back to mmkv (or keep AsyncStorage — performance is fine for
// session tokens).
//
// Supabase's auth client accepts either sync or async returns; the
// `getItem` Promise<string | null> shape AsyncStorage exposes is
// directly usable.

import AsyncStorage from '@react-native-async-storage/async-storage';

const NAMESPACE = 'mei-auth:';

const ns = (key: string): string => `${NAMESPACE}${key}`;

export const mmkvStorage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(ns(key)),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(ns(key), value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(ns(key)),
};
