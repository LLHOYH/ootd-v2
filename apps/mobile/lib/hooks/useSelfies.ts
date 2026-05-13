// useSelfies — read + add + remove the caller's selfies.
//
// SPEC §9.2 + §10.14:
// - Up to 5 selfies per user (enforced by the `selfies_max_5_per_user`
//   trigger at the DB level).
// - Owner-only RLS on both the `selfies` table and the `selfies` storage
//   bucket — there's no cross-user access path, so this hook talks
//   directly to Supabase without going through the api Lambda.
//
// We keep the hook minimal: list + signed-URL resolution + add + remove,
// no analysis. Face/body detection lands in a follow-up PR (B); try-on
// generation in PR C. The shape here is stable enough that those PRs
// can extend `Selfie` with optional fields without breaking callers.

import { useCallback, useEffect, useState } from 'react';
import { selfieKey } from '@mei/types';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';
import {
  type PickedPhoto,
  pickFromCamera as pickFromCameraImpl,
  pickFromLibrary as pickFromLibraryImpl,
} from '../api/closetUpload';
import { uploadSelfie } from '../storage';

export const MAX_SELFIES = 5;

/** Default expiry for the signed display URLs we mint client-side. */
const SIGNED_URL_EXPIRY_SEC = 60 * 60;

/**
 * Tiny RFC-4122 v4 UUID generator. Mei's mobile workspace doesn't bundle
 * `expo-crypto` and we don't want to add a dependency just for this one
 * call — `Math.random` is fine for the collision probabilities we deal
 * with at a per-user table scale (max 5 rows ever), and the `selfies`
 * primary-key UNIQUE constraint backstops the unlikely case.
 */
function newSelfieId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Selfie {
  selfieId: string;
  /** Storage path (`{userId}/{selfieId}.jpg`). */
  storageKey: string;
  uploadedAt: string;
  /** Short-lived signed URL for `<Image>` — refreshed on each list call. */
  url: string;
}

export type UseSelfiesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; selfies: Selfie[] }
  | { status: 'error'; error: Error; selfies: Selfie[] };

export interface UseSelfiesResult {
  state: UseSelfiesState;
  /** Number of selfies the user currently owns. Convenience over reading
   *  `state.selfies.length` everywhere. */
  count: number;
  /** True when count >= MAX_SELFIES — pickers should be hidden. */
  atLimit: boolean;
  /** True while an add or remove is in flight. */
  mutating: boolean;
  addFromCamera: () => Promise<void>;
  addFromLibrary: () => Promise<void>;
  /** Removes the selfie's row + storage object. Best-effort on the storage
   *  delete: if the object is already gone, we still drop the row so the
   *  count stays consistent. */
  remove: (selfieId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useSelfies(): UseSelfiesResult {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id ?? null;

  const [state, setState] = useState<UseSelfiesState>({ status: 'idle' });
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const { data, error } = await supabase
        .from('selfies')
        .select('selfie_id, storage_key, uploaded_at')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;

      // Mint signed URLs in parallel — selfies bucket is private so a
      // bare public URL won't serve. Swallow per-key failures so a stale
      // row doesn't break the whole list.
      const rows = data ?? [];
      const selfies = await Promise.all(
        rows.map(async (r): Promise<Selfie> => {
          const base: Selfie = {
            selfieId: r.selfie_id,
            storageKey: r.storage_key,
            uploadedAt: r.uploaded_at,
            url: '',
          };
          try {
            const { data: signed, error: signErr } = await supabase.storage
              .from('selfies')
              .createSignedUrl(r.storage_key, SIGNED_URL_EXPIRY_SEC);
            if (signErr) throw signErr;
            base.url = signed?.signedUrl ?? '';
          } catch {
            // leave url empty; the screen renders a placeholder slot
          }
          return base;
        }),
      );
      setState({ status: 'ready', selfies });
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load selfies');
      setState((prev) => ({
        status: 'error',
        error: e,
        selfies: prev.status === 'ready' ? prev.selfies : [],
      }));
    }
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [sessionLoading, load]);

  // Common path for both camera + library pickers.
  const addFromPicked = useCallback(
    async (picked: PickedPhoto | null) => {
      if (!picked || !userId) return;
      setMutating(true);
      try {
        // selfie_id is owned client-side so the storage path can be
        // chosen before the row exists. Generate a v4 uuid that the DB
        // will accept (default is gen_random_uuid but we pre-pick so
        // the upload path matches the row we'll insert).
        const selfieId = newSelfieId();
        const key = selfieKey(userId, selfieId);

        // 1. Upload bytes to storage.
        await uploadSelfie(selfieId, picked.uri);

        // 2. Insert the metadata row. RLS owner-only; the
        //    selfies_max_5_per_user trigger enforces the cap and surfaces
        //    a Postgres exception we re-throw verbatim.
        const { error: insertErr } = await supabase.from('selfies').insert({
          selfie_id: selfieId,
          user_id: userId,
          storage_key: key.path,
        });
        if (insertErr) {
          // Roll back the storage upload on a row failure so we don't
          // leak orphaned objects. Best-effort — if remove also fails
          // there's nothing more we can do from the client.
          await supabase.storage.from('selfies').remove([key.path]).catch(() => {});
          throw insertErr;
        }

        await load();
      } finally {
        setMutating(false);
      }
    },
    [userId, load],
  );

  const addFromCamera = useCallback(async () => {
    const picked = await pickFromCameraImpl();
    await addFromPicked(picked);
  }, [addFromPicked]);

  const addFromLibrary = useCallback(async () => {
    const picked = await pickFromLibraryImpl();
    await addFromPicked(picked);
  }, [addFromPicked]);

  const remove = useCallback(
    async (selfieId: string) => {
      if (!userId) return;
      setMutating(true);
      try {
        const target =
          state.status === 'ready' || state.status === 'error'
            ? state.selfies.find((s) => s.selfieId === selfieId)
            : undefined;

        // 1. Drop the row first — that's the authoritative state. Storage
        //    removal is opportunistic cleanup; an orphaned object would
        //    only be visible to a service-role admin.
        const { error: delErr } = await supabase
          .from('selfies')
          .delete()
          .eq('selfie_id', selfieId)
          .eq('user_id', userId);
        if (delErr) throw delErr;

        // 2. Try to remove the storage object. Ignore "not found"-class
        //    errors — we already deleted the row.
        if (target?.storageKey) {
          await supabase.storage.from('selfies').remove([target.storageKey]).catch(() => {});
        }

        await load();
      } finally {
        setMutating(false);
      }
    },
    [userId, state, load],
  );

  const selfies =
    state.status === 'ready' || state.status === 'error' ? state.selfies : [];

  return {
    state,
    count: selfies.length,
    atLimit: selfies.length >= MAX_SELFIES,
    mutating,
    addFromCamera,
    addFromLibrary,
    remove,
    refetch: load,
  };
}
