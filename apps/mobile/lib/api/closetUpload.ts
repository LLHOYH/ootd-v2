// Closet upload helpers — three steps stitched together.
//
//   pickFromCamera() / pickFromLibrary()
//     → ExpoImagePicker.PickedAsset { uri, width, height, mimeType, … }
//
//   uploadClosetItem(asset)
//     → POST /closet/items/upload (count=1)  // mints itemId + signed URL
//     → PUT photo bytes to the signed URL    // raw lands in closet-raw
//     → (dev only) POST /webhooks/storage    // pokes the local worker
//                                            // because Supabase Storage
//                                            // triggers can't reach
//                                            // 127.0.0.1 from the
//                                            // hosted side. Gated on
//                                            // EXPO_PUBLIC_IMAGE_WORKER_URL.
//
// Returns the new `itemId` so the caller can show an optimistic row +
// refetch the list.

import * as ImagePicker from 'expo-image-picker';
import type { UploadItemsResponse } from '@mei/types';
import { ApiError, apiFetch, getImageWorkerUrl } from './client';
import { supabase } from '../supabase';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  /** Best-effort mime type. expo-image-picker doesn't always set this. */
  mimeType?: string;
}

// ---------- Pickers ---------------------------------------------------------

/** Open the OS camera, return the photo or null if cancelled. */
export async function pickFromCamera(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new ApiError(0, 'CAMERA_DENIED', 'Camera permission denied');
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });
  if (res.canceled || res.assets.length === 0) return null;
  const a = res.assets[0]!;
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    ...(a.mimeType ? { mimeType: a.mimeType } : {}),
  };
}

/** Open the OS gallery picker, return the photo or null if cancelled. */
export async function pickFromLibrary(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new ApiError(0, 'LIBRARY_DENIED', 'Photo library permission denied');
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    exif: false,
    selectionLimit: 1,
  });
  if (res.canceled || res.assets.length === 0) return null;
  const a = res.assets[0]!;
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    ...(a.mimeType ? { mimeType: a.mimeType } : {}),
  };
}

// ---------- Upload ---------------------------------------------------------

export interface UploadResult {
  itemId: string;
  /** Storage path (`{userId}/{itemId}.jpg`) — handy for optimistic UI. */
  rawStorageKey: string;
}

interface UploadOptions {
  /**
   * If set, after the PUT completes successfully we POST the storage
   * webhook to this URL so the local image-worker promotes the row.
   * In production the Postgres trigger / storage hook fires the worker
   * server-side and this URL stays unset.
   *
   * Defaults to `getImageWorkerUrl()` from the api client.
   */
  imageWorkerUrl?: string;
  signal?: AbortSignal;
}

/**
 * Pick → upload pipeline for a single photo.
 *
 * Step-by-step error handling:
 *   - POST fails           → throw (no PUT happens, no row is dangling).
 *   - PUT fails            → throw (row is dangling in PROCESSING; the
 *                            api Lambda's pendingReview janitor will
 *                            sweep it eventually). Caller surfaces the
 *                            error and the row is invisible to the user
 *                            because §9.1 hides PROCESSING rows in the UI.
 *   - Worker fire fails    → swallow + warn. The row will land in
 *                            PROCESSING; the user can pull-to-refresh
 *                            once the trigger is configured server-side.
 */
export async function uploadClosetItem(
  asset: PickedPhoto,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  // 1. Mint the row + signed URL.
  const upload = await apiFetch<UploadItemsResponse>('/closet/items/upload', {
    method: 'POST',
    body: { count: 1 },
    signal: opts.signal,
  });
  const slot = upload.items[0];
  if (!slot) {
    throw new ApiError(500, 'NO_SLOT', 'Upload response missing item slot');
  }
  const { itemId, uploadUrl } = slot;

  // 2. PUT the photo to the signed URL.
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const bytes = await readAsBlob(asset.uri);
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'x-upsert': 'false',
    },
    body: bytes,
    signal: opts.signal,
  });
  if (!putRes.ok) {
    const body = await putRes.text();
    throw new ApiError(
      putRes.status,
      'STORAGE_PUT_FAILED',
      `Photo upload failed: ${body.slice(0, 200)}`,
    );
  }

  // 3. Best-effort: poke the local image-worker (dev only).
  const workerUrl = opts.imageWorkerUrl ?? getImageWorkerUrl();
  if (workerUrl) {
    try {
      const userId = (await supabase.auth.getSession()).data.session?.user.id;
      if (userId) {
        const rawStorageKey = inferRawStorageKey(uploadUrl, userId, itemId);
        await fetch(`${workerUrl}/webhooks/storage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'INSERT',
            table: 'objects',
            schema: 'storage',
            record: { bucket_id: 'closet-raw', name: rawStorageKey },
          }),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[closet-upload] worker fire failed (dev only)', err);
    }
  }

  // Caller doesn't need the storage key directly — `closet_items.raw_storage_key`
  // is now set server-side by uploadBatch — but we return it for symmetry
  // with the smoke (and so the optimistic UI can show the right path).
  const userId = (await supabase.auth.getSession()).data.session?.user.id ?? '';
  return {
    itemId,
    rawStorageKey: inferRawStorageKey(uploadUrl, userId, itemId),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a `file://` or `content://` (RN) or `blob:` (web) URI back as a Blob
 * suitable for `fetch(..., { body })`. RN's fetch supports this directly
 * via `{ uri, type, name }` FormData on most engines, but signed PUTs
 * want a raw body — so we fetch the URI ourselves and pass the response
 * blob through.
 */
async function readAsBlob(uri: string): Promise<Blob> {
  const r = await fetch(uri);
  if (!r.ok) {
    throw new ApiError(0, 'LOCAL_READ_FAILED', `Could not read picked photo: ${r.status}`);
  }
  return await r.blob();
}

/**
 * Recover the raw storage key from the signed URL.
 *
 * The signed URL is shaped like:
 *   {project}/storage/v1/object/upload/sign/closet-raw/{userId}/{itemId}.jpg?token=...
 *
 * We split on `/closet-raw/` and take the trailing path (sans query). This
 * stays correct even if the path structure changes elsewhere in the URL.
 */
function inferRawStorageKey(uploadUrl: string, userId: string, itemId: string): string {
  const marker = '/closet-raw/';
  const idx = uploadUrl.indexOf(marker);
  if (idx >= 0) {
    const tail = uploadUrl.slice(idx + marker.length);
    const qIdx = tail.indexOf('?');
    return qIdx >= 0 ? tail.slice(0, qIdx) : tail;
  }
  // Fallback: api Lambda's closetRawKey() convention.
  return `${userId}/${itemId}.jpg`;
}
