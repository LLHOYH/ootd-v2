// POST /closet/items/upload — issue N presigned PUT URLs for batch upload.
//
// SPEC §7.2 (Closet) + §9.1 (Closet item upload pipeline). The mobile
// client sends `{ count }`, the API:
//   1. mints a fresh `itemId` per slot (uuid v4, generated here so the
//      storage key — which embeds the id — and the DB row stay in sync),
//   2. inserts a `closet_items` row in `PROCESSING` state for each slot,
//   3. signs a one-shot upload URL against `closet-raw/{userId}/{itemId}.jpg`
//      and returns the URL + expiry per item.
//
// Why we mint the id on the API side instead of letting Postgres do it:
// `closetRawKey(userId, itemId)` needs the id BEFORE the insert so we can
// embed it in the storage path. We could insert-then-read-back, but doing
// it client-side is one round-trip cheaper and lets us batch-insert.
//
// `category` is required by the schema but unknown until image-worker runs
// Claude vision (§9.1). We pick `TOP` as a placeholder — the worker
// overwrites it on completion. The spec's image-pipeline diagram shows
// the row is invisible to the user until status flips to READY, so the
// placeholder is never rendered.

import { randomUUID } from 'node:crypto';

import {
  UploadItemsBody,
  type UploadItemsResponse,
  closetRawKey,
} from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { signUploadUrl } from '../../../lib/storage';
import { validate } from '../../../middleware/validate';

/** Same TTL as `signUploadUrl`'s default (15 min). Surfaced to the client
 *  so the caller can time out / retry without re-querying us. */
const UPLOAD_TTL_MS = 15 * 60 * 1000;

export const uploadBatchHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: UploadItemsBody }, ctx);

  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();

  // Pre-mint ids so the insert and the upload URL agree on `item_id`.
  const itemIds = Array.from({ length: body.count }, () => randomUUID());

  // Bulk insert all rows. Defaults handle description, colors, tags.
  // `category` has no default → placeholder; image-worker overwrites it.
  const insertRows = itemIds.map((itemId) => ({
    item_id: itemId,
    user_id: userId,
    category: 'TOP' as const,
    name: '',
    status: 'PROCESSING' as const,
  }));

  const { error: insertErr } = await supabase
    .from('closet_items')
    .insert(insertRows);
  if (insertErr) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to create closet items: ${insertErr.message}`,
    );
  }

  // Sign all upload URLs in parallel — each call hits Supabase Storage.
  // If any one fails we propagate the error; the rows we already
  // inserted will simply sit in PROCESSING until cleaned up. That's
  // consistent with how the §9.1 pipeline tolerates dangling rows.
  const items = await Promise.all(
    itemIds.map(async (itemId) => {
      const { signedUrl } = await signUploadUrl(closetRawKey(userId, itemId));
      return { itemId, uploadUrl: signedUrl, expiresAt };
    }),
  );

  const responseBody: UploadItemsResponse = { items };
  return { status: 201, body: responseBody };
};
