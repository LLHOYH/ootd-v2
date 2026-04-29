// Server-side Supabase Storage helpers for the Render API + image-worker.
//
// SPEC.md §6.3 / §9.1 / §9.4. The bucket RLS policies in
// `supabase/migrations/0003_storage_buckets.sql` decide who can read/write;
// this file is the thin wrapper that reaches the Storage HTTP API.
//
// Two execution modes:
//   1. **Service-role client** (`getServiceStorageClient`) — bypasses RLS;
//      used by the image-worker to write `closet-tuned`, thumbnails, and
//      `ootd` outputs (§9.1, §9.3) and by the API for admin cleanup or
//      share-out previews where the recipient isn't authenticated.
//   2. **User-scoped client** — re-exported from `./supabase` (owned by
//      `feat/supabase-auth`). Sign helpers default to the service-role
//      client for safety; pass the user-scoped client explicitly when
//      RLS evaluation against the caller's JWT is the desired behaviour.
//
// We deliberately keep these helpers free of any middleware coupling
// (no import from `services/api/src/middleware/auth.ts`). Callers either
// rely on the default service-role client or pass their own.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageKey } from '@mei/types';

/** Default TTL for signed upload URLs — one-shot uploads complete fast. */
const DEFAULT_UPLOAD_TTL_SEC = 15 * 60; // 15 minutes
/** Default TTL for signed download URLs — share-out previews. */
const DEFAULT_DOWNLOAD_TTL_SEC = 60 * 60; // 1 hour

let _serviceClient: SupabaseClient | undefined;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/**
 * Memoised Supabase client using the service-role key. RLS is bypassed —
 * use only from trusted server contexts (image-worker, admin tools, or
 * server-issued share-out URLs).
 *
 * Env vars (kept out of `./config.ts` so the AWS-side getters remain
 * decoupled from Supabase migration state):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
export function getServiceStorageClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return _serviceClient;
}

/**
 * Mint a one-shot signed upload URL for the mobile client (closet upload
 * per §9.1). Uses the service-role client by default so the API can hand
 * out URLs without itself being JWT-scoped; user authorisation happens
 * upstream in the route handler before we ever get here.
 *
 * The signed URL accepts a single PUT and then 404s. Default TTL is 15
 * minutes — enough for a slow mobile upload, short enough to limit
 * blast radius if the URL leaks.
 */
export async function signUploadUrl(
  key: StorageKey,
  expiresInSec: number = DEFAULT_UPLOAD_TTL_SEC,
): Promise<{ token: string; signedUrl: string; path: string }> {
  // `expiresIn` is supported on `createSignedUploadUrl` from
  // @supabase/storage-js >= 2.7. We cast to the documented option set so
  // the option name is preserved at runtime even on older typings.
  const opts = { upsert: true, expiresIn: expiresInSec } as unknown as {
    upsert: boolean;
  };
  const { data, error } = await getServiceStorageClient()
    .storage
    .from(key.bucket)
    .createSignedUploadUrl(key.path, opts);
  if (error || !data) throw error ?? new Error('signUploadUrl: empty response');
  return {
    token: data.token,
    signedUrl: data.signedUrl,
    path: data.path,
  };
}

/**
 * Sign a time-limited download URL. Uses the service-role client so the
 * URL works for any recipient (e.g. push-notification previews — see
 * §9.4 caveat about share-out vs. RLS-gated reads).
 *
 * For RLS-evaluated downloads (i.e. only succeed if the *caller* has
 * SELECT access to the object), use the user-scoped `supabase` client
 * directly from `./supabase` instead of this helper.
 */
export async function signDownloadUrl(
  key: StorageKey,
  expiresInSec: number = DEFAULT_DOWNLOAD_TTL_SEC,
): Promise<string> {
  const { data, error } = await getServiceStorageClient()
    .storage
    .from(key.bucket)
    .createSignedUrl(key.path, expiresInSec);
  if (error || !data) throw error ?? new Error('signDownloadUrl: empty response');
  return data.signedUrl;
}

/**
 * Delete an object via the service-role client. Bypasses RLS — callers
 * MUST verify ownership before invoking (e.g. closet-api confirms the
 * `closet_items` row belongs to the requesting user, then deletes both
 * the row and the underlying objects).
 */
export async function deleteObject(key: StorageKey): Promise<void> {
  const { error } = await getServiceStorageClient()
    .storage
    .from(key.bucket)
    .remove([key.path]);
  if (error) throw error;
}

/** Test seam — drops the memoised service client so tests can re-init. */
export function __resetServiceStorageClientForTests(): void {
  _serviceClient = undefined;
}
