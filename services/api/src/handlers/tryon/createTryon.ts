// POST /tryon — generate a try-on photo of the caller wearing a combination.
//
// SPEC §10.10 (Wear-this) PR C. Synchronous v1: blocks while
// the image-worker calls the Replicate try-on provider. The caller is the mobile
// Try-on preview screen, which shows a loading state during the wait.
//
// Steps:
//   1. Validate the body and require auth.
//   2. Resolve the selfie: caller-supplied selfieId, else the most-recent.
//      Default try-ons may use the user's latest model photo downstream.
//   3. Resolve the combination and pick the garment item to wear. v1
//      picks the first item by position that the model can actually try
//      on (DRESS > TOP > OUTERWEAR > BOTTOM; SHOE/BAG/ACCESSORY are
//      skipped).
//   4. Idempotency cache: if a READY generation already exists for this
//      (user, person source, combo, item) tuple, return it without spending
//      a Replicate call.
//   5. Insert a new `tryon_generations` row (status=PENDING). The DB
//      trigger enforces the 250/day cap and surfaces a clear exception
//      if exceeded.
//   6. POST the worker /tryon endpoint synchronously. Worker writes back
//      to the row.
//   7. Re-read the row and return it shaped per the contract.

import type { Handler } from '../../context';
import {
  CreateTryonBody,
  tryonGeneratedKey,
  type ClothingCategory,
  type CreateTryonResponse,
  type Tables,
  type TryonGeneration,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { config } from '../../lib/config';
import { signDownloadUrl } from '../../lib/storage';

/** Categories worth trying on, in our preferred wear order. */
const WEARABLE_ORDER: ClothingCategory[] = ['DRESS', 'TOP', 'OUTERWEAR', 'BOTTOM'];
const TRYON_CACHE_PREFIX = 'tryon:nano-v1';

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

  // 3. Pick the garment item from the combination.
  const itemId = await pickPrimaryGarment(supabase, body.comboId);
  log(`picked garment item ${itemId.slice(0, 5)} from combo`);

  const preferModelPhoto = body.selfieId == null;
  const cacheSource = await resolveTryonCacheSource(
    supabase,
    userId,
    selfieId,
    preferModelPhoto,
  );
  log(`cache source is ${cacheSource.label}`);

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
  log('cache MISS — will run a fresh generation');

  // 5. Insert the new row. DB trigger enforces the daily cap.
  const { data: insertedRows, error: insertErr } = await supabase
    .from('tryon_generations')
    .insert({
      user_id: userId,
      selfie_id: selfieId,
      combo_id: body.comboId,
      item_id: itemId,
      status: 'PENDING',
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
  log(`inserted PENDING row ${row.generation_id.slice(0, 5)} — calling image-worker`);

  // 6. Fire the worker synchronously.
  await callWorker({
    generationId: row.generation_id,
    userId,
    selfieId,
    itemId,
    preferModelPhoto,
  });
  log(`image-worker returned for ${row.generation_id.slice(0, 5)} — reading final row`);

  // 7. Re-read the row and shape the response.
  const { data: finalRow, error: readErr } = await supabase
    .from('tryon_generations')
    .select('*')
    .eq('generation_id', row.generation_id)
    .maybeSingle();
  if (readErr || !finalRow) {
    throw new ApiError(
      500,
      'DB_ERROR',
      `post-generation read failed: ${readErr?.message ?? 'no row'}`,
    );
  }
  return { status: 200, body: await mapGeneration(finalRow as GenerationRow) };
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

async function callWorker(payload: {
  generationId: string;
  userId: string;
  selfieId: string;
  itemId: string;
  preferModelPhoto: boolean;
}): Promise<void> {
  const url = `${config.imageWorkerUrl.replace(/\/$/, '')}/tryon`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = config.imageWorkerWebhookSecret;
  if (secret) headers['x-webhook-secret'] = secret;
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    throw new ApiError(502, 'WORKER_UNREACHABLE', `image-worker unreachable: ${msg}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(
      502,
      'WORKER_ERROR',
      `image-worker ${res.status}: ${body.slice(0, 240)}`,
    );
  }
  // Worker returns 200 even on FAILED status — the row's authoritative
  // state is what we re-read next. So nothing to do with the body here.
}

async function resolveTryonCacheSource(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  selfieId: string,
  preferModelPhoto: boolean,
): Promise<{ providerIdPattern: string; label: string }> {
  if (preferModelPhoto) {
    const modelPhotoId = await pickLatestReadyModelPhotoId(supabase, userId);
    if (modelPhotoId) {
      return {
        providerIdPattern: `${TRYON_CACHE_PREFIX}:model:${modelPhotoId}:%`,
        label: `model photo ${modelPhotoId.slice(0, 5)}`,
      };
    }
  }

  return {
    providerIdPattern: `${TRYON_CACHE_PREFIX}:selfie:${selfieId}:%`,
    label: `selfie ${selfieId.slice(0, 5)}`,
  };
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
