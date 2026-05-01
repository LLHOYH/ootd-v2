// promoteClosetItem — the closet-upload promotion pipeline (SPEC §9.1).
//
// Steps, in order:
//   1. Lookup the closet_items row for {userId, itemId}. If missing, the
//      worker was triggered for a key that has no DB row yet — bail out
//      cleanly so the webhook returns 200 and Storage doesn't retry forever.
//   2. Skip if the row is already READY (idempotency: replay-safe).
//   3. Download the raw image from `closet-raw`.
//   4. Run vision tagging — name, description, category, colors, occasions,
//      weather. Failures here are non-fatal; we promote the row to READY
//      anyway with the existing fields, so the user can manually re-tag.
//   5. Run image processing — produce tuned + thumbnail WebPs.
//   6. Upload tuned + thumbnail to `closet-tuned`.
//   7. Update the row: status=READY, set tuned/thumbnail keys, merge in
//      any vision-derived fields (only when vision succeeded).
//
// Each pipeline run is logged with the {userId, itemId, raw_storage_key}
// trio so failures are diagnosable from logs alone.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tables } from '@mei/types';
import {
  downloadRaw,
  uploadTuned,
} from '../lib/storage';
import { getImageProcessProvider } from '../providers/imageProcess';
import { getVisionProvider, type VisionTags } from '../providers/vision';
import type { ImageWorkerConfig } from '../config';

type ClosetItemRow = Tables<'closet_items'>;

export interface PromoteInput {
  userId: string;
  itemId: string;
  /** Storage key inside `closet-raw` — usually `{userId}/{itemId}.{ext}`. */
  rawStorageKey: string;
}

export interface PromoteResult {
  status:
    | 'promoted'
    | 'no-row'
    | 'already-ready'
    | 'failed';
  itemId: string;
  detail?: string;
}

function inferMimeType(rawStorageKey: string): string {
  const lower = rawStorageKey.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

export async function promoteClosetItem(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  input: PromoteInput,
  logger: { info: (m: string, ctx?: object) => void; warn: (m: string, ctx?: object) => void; error: (m: string, ctx?: object) => void } = console,
): Promise<PromoteResult> {
  const ctx = {
    userId: input.userId,
    itemId: input.itemId,
    rawStorageKey: input.rawStorageKey,
  };

  // 1. Lookup the row. We require it to exist (the api Lambda creates it
  // before the client uploads the photo).
  const { data: rowData, error: rowErr } = await supabase
    .from('closet_items')
    .select(
      'item_id, user_id, status, raw_storage_key, tuned_storage_key, thumbnail_storage_key, name, description, category, colors, occasion_tags, weather_tags',
    )
    .eq('item_id', input.itemId)
    .maybeSingle();
  if (rowErr) {
    logger.error('lookup failed', { ...ctx, err: rowErr.message });
    return { status: 'failed', itemId: input.itemId, detail: rowErr.message };
  }
  if (!rowData) {
    logger.warn('no closet_items row for upload — skipping', ctx);
    return { status: 'no-row', itemId: input.itemId };
  }
  const row = rowData as ClosetItemRow;

  // 2. Idempotency: skip if already READY.
  if (row.status === 'READY') {
    logger.info('item already READY — skipping', ctx);
    return { status: 'already-ready', itemId: input.itemId };
  }

  // 3. Download raw.
  let raw: Buffer;
  try {
    raw = await downloadRaw(supabase, input.rawStorageKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'download failed';
    logger.error('raw download failed', { ...ctx, err: msg });
    await markFailed(supabase, input.itemId, logger);
    return { status: 'failed', itemId: input.itemId, detail: msg };
  }

  // 4. Vision tagging — best-effort.
  let tags: VisionTags | null = null;
  try {
    const vision = getVisionProvider(cfg);
    tags = await vision.describe(raw, inferMimeType(input.rawStorageKey));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'vision failed';
    logger.warn('vision tagging failed; continuing without tags', { ...ctx, err: msg });
  }

  // 5. Image processing — must succeed (no useful tuned image otherwise).
  let processed: { tuned: Buffer; thumb: Buffer };
  try {
    const ip = getImageProcessProvider(cfg);
    processed = await ip.process(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'processing failed';
    logger.error('image processing failed', { ...ctx, err: msg });
    await markFailed(supabase, input.itemId, logger);
    return { status: 'failed', itemId: input.itemId, detail: msg };
  }

  // 6. Upload tuned + thumb.
  let uploaded: { tunedKey: string; thumbKey: string };
  try {
    uploaded = await uploadTuned(
      supabase,
      input.userId,
      input.itemId,
      processed.tuned,
      processed.thumb,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upload failed';
    logger.error('tuned upload failed', { ...ctx, err: msg });
    await markFailed(supabase, input.itemId, logger);
    return { status: 'failed', itemId: input.itemId, detail: msg };
  }

  // 7. Promote the row.
  const update: Partial<ClosetItemRow> = {
    status: 'READY',
    tuned_storage_key: uploaded.tunedKey,
    thumbnail_storage_key: uploaded.thumbKey,
    updated_at: new Date().toISOString(),
  };
  if (tags) {
    // Only overwrite name/description if the row currently holds the
    // initial-empty placeholder. The user may have edited these between
    // upload and webhook arrival.
    if (!row.name || row.name.length === 0) update.name = tags.name;
    if (!row.description || row.description.length === 0) {
      update.description = tags.description;
    }
    update.category = tags.category;
    update.colors = tags.colors;
    update.occasion_tags = tags.occasionTags;
    update.weather_tags = tags.weatherTags;
  }
  const { error: upErr } = await supabase
    .from('closet_items')
    .update(update)
    .eq('item_id', input.itemId);
  if (upErr) {
    logger.error('row update failed', { ...ctx, err: upErr.message });
    return { status: 'failed', itemId: input.itemId, detail: upErr.message };
  }

  logger.info('promoted', {
    ...ctx,
    tunedKey: uploaded.tunedKey,
    thumbKey: uploaded.thumbKey,
    taggedBy: tags ? 'vision' : 'none',
  });
  return { status: 'promoted', itemId: input.itemId };
}

async function markFailed(
  supabase: SupabaseClient,
  itemId: string,
  logger: { warn: (m: string, ctx?: object) => void },
): Promise<void> {
  const { error } = await supabase
    .from('closet_items')
    .update({ status: 'FAILED', updated_at: new Date().toISOString() })
    .eq('item_id', itemId);
  if (error) {
    logger.warn('mark-failed update errored', { itemId, err: error.message });
  }
}
