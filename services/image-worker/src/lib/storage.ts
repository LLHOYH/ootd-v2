// Storage helpers — download a raw upload, upload a tuned image + thumbnail.
//
// All operations route through the service-role client. Buckets:
//   `closet-raw`    — private; owner-only via RLS. Worker reads via service-role.
//   `closet-tuned`  — public; CDN-cached. Worker writes; clients read.
//
// Storage paths follow the §6.3 convention: `{user_id}/{item_id}.{ext}`.

import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET_RAW = 'closet-raw';
export const BUCKET_TUNED = 'closet-tuned';

export async function downloadRaw(
  supabase: SupabaseClient,
  storageKey: string,
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET_RAW).download(storageKey);
  if (error || !data) {
    throw new Error(`Failed to download ${BUCKET_RAW}/${storageKey}: ${error?.message ?? 'no body'}`);
  }
  // Blob → Buffer (Node 20+).
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export interface TunedUploadResult {
  tunedKey: string;
  thumbKey: string;
}

/**
 * Upload tuned image + thumbnail to `closet-tuned` for a given (user, item).
 *
 * Convention: `{userId}/{itemId}.webp` for the tuned image, `{userId}/{itemId}_thumb.webp`
 * for the thumbnail. Same bucket so a single owner/friend SELECT policy gates both.
 *
 * `upsert: true` so re-running the worker on the same item replaces the
 * previous output cleanly (e.g. after a re-tune).
 */
export async function uploadTuned(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  tuned: Buffer,
  thumb: Buffer,
): Promise<TunedUploadResult> {
  const tunedKey = `${userId}/${itemId}.webp`;
  const thumbKey = `${userId}/${itemId}_thumb.webp`;

  const tunedRes = await supabase.storage.from(BUCKET_TUNED).upload(tunedKey, tuned, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (tunedRes.error) {
    throw new Error(
      `Failed to upload tuned image ${BUCKET_TUNED}/${tunedKey}: ${tunedRes.error.message}`,
    );
  }

  const thumbRes = await supabase.storage.from(BUCKET_TUNED).upload(thumbKey, thumb, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (thumbRes.error) {
    throw new Error(
      `Failed to upload thumbnail ${BUCKET_TUNED}/${thumbKey}: ${thumbRes.error.message}`,
    );
  }

  return { tunedKey, thumbKey };
}

/**
 * Parse `{userId}/{itemId}.{ext}` (or any subpath of that shape) into its
 * two id components. Returns null on a malformed key.
 */
export function parseRawObjectKey(
  key: string,
): { userId: string; itemId: string } | null {
  // Tolerate leading/trailing slashes and additional path segments — only
  // the first two segments matter.
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const userId = parts[0]!;
  const tail = parts[1]!;
  // Strip extension.
  const dot = tail.lastIndexOf('.');
  const itemId = dot >= 0 ? tail.slice(0, dot) : tail;
  if (!userId || !itemId) return null;
  return { userId, itemId };
}
