// Mobile-side Supabase Storage helpers.
//
// SPEC.md §6.3 / §9.1 / §9.2 / §9.4 — closet uploads, selfie uploads, and
// privacy guarantees. RLS policies on `storage.objects` (see
// `supabase/migrations/0003_storage_buckets.sql`) gate every read/write,
// so these helpers don't need to mint signed URLs for the happy path —
// the user's JWT carries the access decision.
//
// We expose a few thin wrappers so callers don't have to remember bucket
// names or path conventions. All path construction goes through the
// helpers in `@mei/types/storage` to keep the `{user_id}/{entity_id}.{ext}`
// scheme in lockstep with the RLS policies.
//
// Auth + the `supabase` client are owned by `feat/supabase-auth`. We
// import from `./supabase`; if that file doesn't exist yet at typecheck
// time the parallel branch will land it before merge.

// SDK 54 introduced a new file-system API on the bare `expo-file-system`
// import. The legacy `readAsStringAsync` + `EncodingType.Base64` flow we
// rely on here still ships under the `/legacy` subpath. Switch to the
// new API in a follow-up.
import * as FileSystem from 'expo-file-system/legacy';
import {
  closetRawKey,
  selfieKey,
  type StorageKey,
} from '@mei/types';
import { supabase } from './supabase';

/** Default expiry for share-out signed URLs (1 hour). */
const DEFAULT_SIGNED_URL_EXPIRY_SEC = 60 * 60;

/**
 * Read the active session's user id, or throw if signed out. The Storage
 * RLS policies require `auth.uid()::text = (storage.foldername(name))[1]`,
 * so without a user id we can't construct a writable path.
 */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('storage: no active session — sign in before uploading.');
  }
  return userId;
}

/**
 * Convert a base64 string to a Uint8Array. The Supabase JS Storage client
 * accepts ArrayBuffer / Blob / Uint8Array on React Native (Blob support
 * on RN is unreliable, so we feed it bytes directly).
 */
function base64ToBytes(b64: string): Uint8Array {
  // `globalThis.atob` is provided by React Native's standard runtime.
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Read a local `file://` URI as bytes. Expo's `FileSystem` is the
 * cross-platform way; `readAsStringAsync` with base64 encoding works on
 * iOS, Android, and web.
 */
async function readFileBytes(fileUri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(b64);
}

/**
 * Best-effort content-type guess from the URI extension. Supabase
 * enforces `allowed_mime_types` per bucket (see 0003_storage_buckets.sql),
 * so we default to JPEG for raw closet/selfies.
 */
function guessContentType(fileUri: string, fallback: string): string {
  const lower = fileUri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

/**
 * Upload a closet item's raw photo to `closet-raw/{user_id}/{itemId}.jpg`.
 * §9.1 — the image-worker picks it up via Storage webhook and writes the
 * tuned/thumbnail companions back in `closet-tuned`.
 */
export async function uploadItemPhoto(
  itemId: string,
  fileUri: string,
): Promise<{ key: StorageKey }> {
  const userId = await requireUserId();
  const key = closetRawKey(userId, itemId);
  const bytes = await readFileBytes(fileUri);
  const { error } = await supabase.storage
    .from(key.bucket)
    .upload(key.path, bytes, {
      contentType: guessContentType(fileUri, 'image/jpeg'),
      upsert: true,
    });
  if (error) throw error;
  return { key };
}

/**
 * Upload a selfie to `selfies/{user_id}/{selfieId}.jpg`. §9.2 — owner-only
 * RLS, no cross-user access ever.
 */
export async function uploadSelfie(
  selfieId: string,
  fileUri: string,
): Promise<{ key: StorageKey }> {
  const userId = await requireUserId();
  const key = selfieKey(userId, selfieId);
  const bytes = await readFileBytes(fileUri);
  const { error } = await supabase.storage
    .from(key.bucket)
    .upload(key.path, bytes, {
      contentType: guessContentType(fileUri, 'image/jpeg'),
      upsert: true,
    });
  if (error) throw error;
  return { key };
}

/**
 * Resolve a `StorageKey` to a public URL via the auth-aware Storage API.
 * Works even on private buckets when the caller has RLS-allowed access —
 * Supabase serves the bytes through the Storage gateway, which evaluates
 * the policies against the request's JWT (§9.4).
 */
export function getPublicUrl(key: StorageKey): string {
  return supabase.storage.from(key.bucket).getPublicUrl(key.path).data
    .publicUrl;
}

/**
 * Mint a time-limited signed URL for share-out flows where the recipient
 * may not be authenticated (e.g. a copy-link share). RLS still applies at
 * sign time — the URL will only succeed if the *signer's* JWT has SELECT
 * access. Defaults to 1 hour.
 */
export async function getSignedUrl(
  key: StorageKey,
  expiresInSec: number = DEFAULT_SIGNED_URL_EXPIRY_SEC,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(key.bucket)
    .createSignedUrl(key.path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}
