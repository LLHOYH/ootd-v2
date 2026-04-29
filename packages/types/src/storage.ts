// Storage helpers — pure functions that mint Supabase Storage paths.
//
// Source of truth: SPEC.md §6.3 (bucket layout) and
// `supabase/migrations/0003_storage_buckets.sql` (RLS policies).
//
// The RLS policies extract the owner uuid via
//   `(storage.foldername(name))[1]::uuid`
// so the FIRST path segment of every object name MUST be the user's uuid.
// If you change the path scheme, RLS will silently stop matching.
//
// Extensions follow §6.3:
//   closet-raw    → .jpg
//   closet-tuned  → .webp
//   selfies       → .jpg
//   ootd          → .webp
// Thumbnails live in `closet-tuned` (§9.1 image pipeline) under a
// `_thumb` suffix so the tuned and thumbnail keys never collide for the
// same item id.

export type BucketId = 'closet-raw' | 'closet-tuned' | 'selfies' | 'ootd';

export interface StorageKey {
  bucket: BucketId;
  /** Path within the bucket: `{user_id}/{entity_id}.{ext}` (§6.3). */
  path: string;
}

/** `closet-raw/{user_id}/{item_id}.jpg` — owner-only RLS. */
export function closetRawKey(userId: string, itemId: string): StorageKey {
  return { bucket: 'closet-raw', path: `${userId}/${itemId}.jpg` };
}

/** `closet-tuned/{user_id}/{item_id}.webp` — owner-or-friend RLS. */
export function closetTunedKey(userId: string, itemId: string): StorageKey {
  return { bucket: 'closet-tuned', path: `${userId}/${itemId}.webp` };
}

/**
 * `closet-tuned/{user_id}/{item_id}_thumb.webp` — same bucket as the
 * tuned image so a single RLS policy covers both reads. The `_thumb`
 * suffix keeps the path distinct from the full-size tuned image.
 */
export function thumbnailKey(userId: string, itemId: string): StorageKey {
  return { bucket: 'closet-tuned', path: `${userId}/${itemId}_thumb.webp` };
}

/** `selfies/{user_id}/{selfie_id}.jpg` — owner-only RLS. */
export function selfieKey(userId: string, selfieId: string): StorageKey {
  return { bucket: 'selfies', path: `${userId}/${selfieId}.jpg` };
}

/** `ootd/{user_id}/{ootd_id}.webp` — visibility-scoped RLS. */
export function ootdKey(userId: string, ootdId: string): StorageKey {
  return { bucket: 'ootd', path: `${userId}/${ootdId}.webp` };
}
