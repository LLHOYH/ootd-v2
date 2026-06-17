// POST /tryon — generate a try-on photo of the caller wearing a combination.
//
// SPEC §10.10 (Wear-this) PR C. Async v1: inserts a PENDING row and
// returns immediately. The image-worker polls PENDING rows and promotes
// them to READY/FAILED while mobile polls GET /tryon/:id.
//
// Steps:
//   1. Validate the body and require auth.
//   2. Resolve the selfie: caller-supplied selfieId, else the most-recent.
//      Default try-ons require the user's latest model photo downstream.
//   3. Resolve the combination and pick a primary garment item. The worker
//      now renders the full combo, but the DB row still keeps one item_id for
//      legacy queries/indexes.
//   4. Idempotency cache: if a READY or PENDING generation already exists
//      for this (user, person source, combo, item) tuple, return it without
//      spending or queueing another Replicate call.
//   5. Insert a new `tryon_generations` row (status=PENDING). The DB
//      trigger enforces the 250/day cap and surfaces a clear exception
//      if exceeded.

import type { Handler } from '../../context';
import {
  CreateTryonBody,
  type ClothingCategory,
  type CreateTryonResponse,
  type Tables,
  type TryonGeneration,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { signDownloadUrl } from '../../lib/storage';

/** Categories worth trying on, in our preferred wear order. */
const WEARABLE_ORDER: ClothingCategory[] = ['DRESS', 'TOP', 'OUTERWEAR', 'BOTTOM'];
const TRYON_CACHE_PREFIX = 'tryon:nano-v2';

type GenerationRow = Tables<'tryon_generations'>;

export const createTryonHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateTryonBody }, ctx);

  // Step narrator for dogfooding. The worker side has its own per-step
  // log line tagged by generation_id; this side is tagged "api" since
  // we don't have a generation_id until step 5.
  const log = (msg: string) => console.log(`[tryon api] ${msg}`);
  log(`received POST /tryon (user=${userId.slice(0, 5)}, combo=${body.comboId.slice(0, 5)})`);

  // 2. Pick a selfie.
  const selfieId = body.selfieId ?? (await pickMostRecentSelfie(supabase, userId));
  if (!selfieId) {
    throw new ApiError(
      400,
      'NO_SELFIE',
      'Add at least one selfie before generating a try-on.',
    );
  }
  log(`picked selfie ${selfieId.slice(0, 5)}${body.selfieId ? ' (caller-supplied)' : ' (most recent)'}`);

  // 3. Pick the primary garment item from the combination. Full-combo image
  // inputs are resolved by the worker from combo_id when it processes the row.
  const itemId = await pickPrimaryGarment(supabase, body.comboId);
  log(`picked garment item ${itemId.slice(0, 5)} from combo`);

  const preferModelPhoto = body.selfieId == null;
  const modelPhotoId = preferModelPhoto
    ? await pickLatestReadyModelPhotoId(supabase, userId)
    : null;
  if (preferModelPhoto && !modelPhotoId) {
    throw new ApiError(
      400,
      'NO_MODEL_PHOTO',
      'Generate your model photo before trying on outfits.',
    );
  }
  if (modelPhotoId) {
    log(`using model photo ${modelPhotoId.slice(0, 5)} for default try-on`);
  }
  const cacheSource = resolveTryonCacheSource(
    selfieId,
    preferModelPhoto,
    modelPhotoId,
  );
  log(`cache source is ${cacheSource.label}`);

  const queuedProviderId = resolveQueuedProviderId(
    selfieId,
    preferModelPhoto,
    modelPhotoId,
  );

  // 4. Idempotency: return a cached READY generation if one exists.
  const { data: cachedRows, error: cachedErr } = await supabase
    .from('tryon_generations')
    .select('*')
    .eq('user_id', userId)
    .eq('selfie_id', selfieId)
    .eq('combo_id', body.comboId)
    .eq('item_id', itemId)
    .eq('status', 'READY')
    .like('provider_id', cacheSource.providerIdPattern)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (cachedErr) {
    throw new ApiError(500, 'DB_ERROR', `cached lookup failed: ${cachedErr.message}`);
  }
  const cached = ((cachedRows ?? []) as GenerationRow[])[0];
  if (cached) {
    log(`cache HIT — returning cached generation ${cached.generation_id.slice(0, 5)} (no Replicate call)`);
    return { status: 200, body: await mapGeneration(cached) };
  }
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('tryon_generations')
    .select('*')
    .eq('user_id', userId)
    .eq('selfie_id', selfieId)
    .eq('combo_id', body.comboId)
    .eq('item_id', itemId)
    .eq('status', 'PENDING')
    .eq('provider_id', queuedProviderId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (pendingErr) {
    throw new ApiError(500, 'DB_ERROR', `pending lookup failed: ${pendingErr.message}`);
  }
  const pending = ((pendingRows ?? []) as GenerationRow[])[0];
  if (pending) {
    log(`queue HIT — returning pending generation ${pending.generation_id.slice(0, 5)}`);
    return { status: 202, body: await mapGeneration(pending) };
  }
  log('cache MISS — queueing a fresh generation');

  // 5. Insert the new row. DB trigger enforces the daily cap.
  const { data: insertedRows, error: insertErr } = await supabase
    .from('tryon_generations')
    .insert({
      user_id: userId,
      selfie_id: selfieId,
      combo_id: body.comboId,
      item_id: itemId,
      status: 'PENDING',
      provider_id: queuedProviderId,
    })
    .select('*')
    .limit(1);
  if (insertErr) {
    if (insertErr.code === '23514' || /Try-on limit/.test(insertErr.message)) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Try-on limit reached for today (250/day). Try again tomorrow.',
      );
    }
    throw new ApiError(500, 'DB_ERROR', `insert failed: ${insertErr.message}`);
  }
  const row = ((insertedRows ?? []) as GenerationRow[])[0];
  if (!row) {
    throw new ApiError(500, 'DB_ERROR', 'insert returned no row');
  }
  log(`queued PENDING row ${row.generation_id.slice(0, 5)}`);
  return { status: 202, body: await mapGeneration(row) };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pickMostRecentSelfie(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('selfies')
    .select('selfie_id')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `selfie lookup failed: ${error.message}`);
  }
  const row = ((data ?? []) as { selfie_id: string }[])[0];
  return row?.selfie_id ?? null;
}

async function pickPrimaryGarment(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  comboId: string,
): Promise<string> {
  // Pull every item in the combination + its category, ordered by
  // combination_items.position. Then pick the first that falls in
  // WEARABLE_ORDER's preferred category list.
  const { data, error } = await supabase
    .from('combinations')
    .select(
      `combo_id,
       combination_items (
         item_id,
         position,
         closet_items (
           item_id,
           category
         )
       )`,
    )
    .eq('combo_id', comboId)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `combo lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'COMBO_NOT_FOUND', 'That combination doesn’t exist.');
  }
  // Supabase joins surface `closet_items` as an array even when the FK
  // is one-to-one, so we normalise to "first row, if any" here.
  type JoinedItem = {
    item_id: string;
    position: number;
    closet_items:
      | { item_id: string; category: ClothingCategory }
      | { item_id: string; category: ClothingCategory }[]
      | null;
  };
  type Joined = { combination_items?: JoinedItem[] | null };
  const joined = (data as unknown as Joined).combination_items ?? [];
  const items = joined
    .map((j) => {
      const ci = Array.isArray(j.closet_items) ? j.closet_items[0] : j.closet_items;
      if (!ci) return null;
      return { itemId: j.item_id, position: j.position, category: ci.category };
    })
    .filter((x): x is { itemId: string; position: number; category: ClothingCategory } => x != null)
    .sort((a, b) => a.position - b.position);

  // Pick by category priority. Within a category bucket, lowest
  // position wins (= primary).
  for (const cat of WEARABLE_ORDER) {
    const pick = items.find((it) => it.category === cat);
    if (pick) return pick.itemId;
  }
  throw new ApiError(
    400,
    'NO_WEARABLE_ITEM',
    'This combination has no dress, top, outerwear, or bottom. Try-on needs one of those.',
  );
}

function resolveTryonCacheSource(
  selfieId: string,
  preferModelPhoto: boolean,
  modelPhotoId: string | null,
): { providerIdPattern: string; label: string } {
  if (preferModelPhoto && modelPhotoId) {
    return {
      providerIdPattern: `${TRYON_CACHE_PREFIX}:model:${modelPhotoId}:%`,
      label: `model photo ${modelPhotoId.slice(0, 5)}`,
    };
  }

  return {
    providerIdPattern: `${TRYON_CACHE_PREFIX}:selfie:${selfieId}:%`,
    label: `selfie ${selfieId.slice(0, 5)}`,
  };
}

function resolveQueuedProviderId(
  selfieId: string,
  preferModelPhoto: boolean,
  modelPhotoId: string | null,
): string {
  if (preferModelPhoto && modelPhotoId) {
    return `${TRYON_CACHE_PREFIX}:queued:model:${modelPhotoId}`;
  }
  return `${TRYON_CACHE_PREFIX}:queued:selfie:${selfieId}`;
}

async function pickLatestReadyModelPhotoId(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('model_photos')
    .select('model_photo_id')
    .eq('user_id', userId)
    .eq('status', 'READY')
    .not('storage_key', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `model photo lookup failed: ${error.message}`);
  }
  const row = ((data ?? []) as { model_photo_id: string }[])[0];
  return row?.model_photo_id ?? null;
}

async function mapGeneration(row: GenerationRow): Promise<TryonGeneration> {
  const base: TryonGeneration = {
    generationId: row.generation_id,
    userId: row.user_id,
    selfieId: row.selfie_id,
    comboId: row.combo_id,
    itemId: row.item_id,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.completed_at) base.completedAt = row.completed_at;
  if (row.error_detail) base.errorDetail = row.error_detail;
  if (row.status === 'READY' && row.generated_storage_key) {
    try {
      base.imageUrl = await signDownloadUrl({
        bucket: 'tryon-generated',
        path: row.generated_storage_key,
      });
    } catch {
      // Leave imageUrl undefined; client renders placeholder.
    }
  }
  return base;
}
