// generateTryon — orchestrate one try-on generation.
//
// Inputs come from the api Lambda's POST /tryon handler. Steps:
//
//   1. Look up the generation row (api creates it before calling us).
//      Bail if it's already READY (idempotency on retry).
//   2. Resolve the person reference: latest model photo for default try-ons,
//      otherwise the selected selfie.
//   3. Download the garment bytes from the `closet-tuned` bucket.
//   4. Look up the item's name + category for the model's text/category inputs.
//   5. Call the TryonProvider — synchronous, returns image bytes.
//   6. Re-encode to WebP and upload to `tryon-generated`.
//   7. Update the row: status=READY, set generated_storage_key, completed_at.
//
// On any failure between step 2 and step 6 we mark the row FAILED with a
// short detail string and re-throw, so the api caller can surface a
// useful error to the user instead of a generic 500.

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tables, ClothingCategory } from '@mei/types';
import { tryonGeneratedKey } from '@mei/types';
import type { ImageWorkerConfig } from '../config';
import { getTryonProvider } from '../providers/tryon';

const BUCKET_SELFIES = 'selfies';
const BUCKET_MODEL_PHOTOS = 'model-photos';
const BUCKET_TUNED = 'closet-tuned';
const BUCKET_GENERATED = 'tryon-generated';
const TRYON_CACHE_PREFIX = 'tryon:nano-v1';

export interface GenerateTryonInput {
  generationId: string;
  userId: string;
  selfieId: string;
  itemId: string;
  /** Default try-ons use the user's generated model photo. Explicit
   *  API calls with a selfieId can still opt into selfie-based try-ons. */
  preferModelPhoto?: boolean;
}

export interface GenerateTryonResult {
  status: 'ready' | 'already-ready' | 'failed';
  generationId: string;
  generatedStorageKey?: string;
  providerId?: string;
  detail?: string;
}

type GenerationRow = Tables<'tryon_generations'>;
type SelfieRow = Tables<'selfies'>;
type ItemRow = Tables<'closet_items'>;

interface ModelPhotoRow {
  model_photo_id: string;
  storage_key: string | null;
}

interface PersonReference {
  image: Buffer;
  cacheKey: string;
  label: string;
}

export async function generateTryon(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  input: GenerateTryonInput,
  logger: {
    info: (m: string, ctx?: object) => void;
    warn: (m: string, ctx?: object) => void;
    error: (m: string, ctx?: object) => void;
  } = console,
): Promise<GenerateTryonResult> {
  const ctx = { ...input };

  // Dogfooding step-narrator. Plain stdout, not pino, so it actually
  // reads like a story in `pnpm services`. Tagged with a short id so
  // concurrent generations don't interleave.
  const t0 = Date.now();
  const shortId = input.generationId.slice(0, 5);
  const step = (msg: string) =>
    console.log(`[tryon ${shortId}] ${msg}`);
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
  step(
    `received request (user=${input.userId.slice(0, 5)}, selfie=${input.selfieId.slice(0, 5)}, item=${input.itemId.slice(0, 5)})`,
  );

  // 1. Look up the generation row.
  const { data: genData, error: genErr } = await supabase
    .from('tryon_generations')
    .select('generation_id, status')
    .eq('generation_id', input.generationId)
    .maybeSingle();
  if (genErr) {
    logger.error('tryon row lookup failed', { ...ctx, err: genErr.message });
    return { status: 'failed', generationId: input.generationId, detail: genErr.message };
  }
  if (!genData) {
    return { status: 'failed', generationId: input.generationId, detail: 'no row' };
  }
  const genRow = genData as Pick<GenerationRow, 'generation_id' | 'status'>;
  if (genRow.status === 'READY') {
    logger.info('tryon already READY — skipping', ctx);
    return { status: 'already-ready', generationId: input.generationId };
  }

  try {
    // 2. Person reference. Default "put this on me" generations require
    // the model photo created from selfies. We do not silently fall back
    // to raw selfies because that creates misleading "successful" outputs.
    const person = await resolvePersonReference(supabase, input, step);
    step(`using ${person.label} as person reference (${(person.image.length / 1024).toFixed(0)} KB)`);

    // 3. Garment bytes.
    step('extracting garment photo from closet-tuned bucket...');
    const garment = await fetchTunedItem(supabase, input.itemId);
    step(`got garment (${(garment.length / 1024).toFixed(0)} KB)`);

    // 4. Item metadata (name + category) for the model's text inputs.
    const itemMeta = await fetchItemMeta(supabase, input.itemId);
    step(`item is "${itemMeta.name}" (${itemMeta.category})`);

    // 5. Generate.
    step(
      `prompting Replicate Nano Banana Pro: put "${itemMeta.name}" on this person`,
    );
    const provider = getTryonProvider(cfg);
    const out = await provider.generate({
      humanImage: person.image,
      garmentImage: garment,
      garmentDescription: itemMeta.name,
      category: itemMeta.category,
      logTag: shortId,
    });

    // 6. Re-encode to WebP and upload.
    step('encoding generated image to WebP (q=88)...');
    const webp = await sharp(out.image).rotate().webp({ quality: 88 }).toBuffer();
    const key = tryonGeneratedKey(input.userId, input.generationId).path;
    step(
      `uploading ${(webp.length / 1024).toFixed(0)} KB to ${BUCKET_GENERATED}/${key}...`,
    );
    const uploadRes = await supabase.storage
      .from(BUCKET_GENERATED)
      .upload(key, webp, { contentType: 'image/webp', upsert: true });
    if (uploadRes.error) {
      throw new Error(
        `upload ${BUCKET_GENERATED}/${key} failed: ${uploadRes.error.message}`,
      );
    }

    // 7. Promote the row.
    step('marking generation READY in DB');
    const { error: upErr } = await supabase
      .from('tryon_generations')
      .update({
        status: 'READY',
        generated_storage_key: key,
        provider_id: `${TRYON_CACHE_PREFIX}:${person.cacheKey}:${out.providerId ?? 'mock'}`,
        completed_at: new Date().toISOString(),
      })
      .eq('generation_id', input.generationId);
    if (upErr) {
      throw new Error(`row update failed: ${upErr.message}`);
    }

    step(`complete in ${elapsed()}s`);
    logger.info('tryon generated', {
      ...ctx,
      key,
      providerId: out.providerId,
    });
    return {
      status: 'ready',
      generationId: input.generationId,
      generatedStorageKey: key,
      providerId: out.providerId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed';
    step(`failed after ${elapsed()}s: ${msg}`);
    logger.error('tryon generation failed', { ...ctx, err: msg });
    await markFailed(supabase, input.generationId, msg, logger);
    return { status: 'failed', generationId: input.generationId, detail: msg };
  }
}

// ---------------------------------------------------------------------------
// Per-step helpers
// ---------------------------------------------------------------------------

async function fetchSelfie(
  supabase: SupabaseClient,
  userId: string,
  selfieId: string,
): Promise<Buffer> {
  const { data: row, error: rowErr } = await supabase
    .from('selfies')
    .select('storage_key')
    .eq('selfie_id', selfieId)
    .eq('user_id', userId)
    .maybeSingle();
  if (rowErr || !row) {
    throw new Error(`selfie ${selfieId} not found: ${rowErr?.message ?? 'no row'}`);
  }
  const selfieRow = row as Pick<SelfieRow, 'storage_key'>;
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET_SELFIES)
    .download(selfieRow.storage_key);
  if (dlErr || !blob) {
    throw new Error(
      `selfie download ${BUCKET_SELFIES}/${selfieRow.storage_key} failed: ${dlErr?.message ?? 'no body'}`,
    );
  }
  return Buffer.from(await blob.arrayBuffer());
}

async function resolvePersonReference(
  supabase: SupabaseClient,
  input: GenerateTryonInput,
  step: (msg: string) => void,
): Promise<PersonReference> {
  if (input.preferModelPhoto) {
    try {
      step('looking for latest READY model photo...');
      const model = await fetchLatestModelPhoto(supabase, input.userId);
      if (model) {
        step(`found model photo ${model.modelPhotoId.slice(0, 5)}; preparing it for try-on...`);
        return {
          image: await preparePersonImage(model.image),
          cacheKey: `model:${model.modelPhotoId}`,
          label: `model photo ${model.modelPhotoId.slice(0, 5)}`,
        };
      }
      throw new Error('no READY model photo found');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      step(`model photo unavailable (${msg})`);
      throw new Error(`Model photo unavailable: ${msg}`);
    }
  }

  step('extracting selfie from Supabase storage...');
  const selfieRaw = await fetchSelfie(supabase, input.userId, input.selfieId);
  step(`got selfie (${(selfieRaw.length / 1024).toFixed(0)} KB raw)`);
  return {
    image: await preparePersonImage(selfieRaw),
    cacheKey: `selfie:${input.selfieId}`,
    label: `selfie ${input.selfieId.slice(0, 5)}`,
  };
}

async function preparePersonImage(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate()
    .resize({ width: 1280, height: 1707, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function fetchLatestModelPhoto(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ modelPhotoId: string; image: Buffer } | null> {
  const { data, error } = await supabase
    .from('model_photos')
    .select('model_photo_id, storage_key')
    .eq('user_id', userId)
    .eq('status', 'READY')
    .not('storage_key', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`model photo lookup failed: ${error.message}`);
  }
  const row = ((data ?? []) as Pick<ModelPhotoRow, 'model_photo_id' | 'storage_key'>[])[0];
  if (!row?.storage_key) return null;

  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET_MODEL_PHOTOS)
    .download(row.storage_key);
  if (dlErr || !blob) {
    throw new Error(
      `model photo download ${BUCKET_MODEL_PHOTOS}/${row.storage_key} failed: ${dlErr?.message ?? 'no body'}`,
    );
  }
  return {
    modelPhotoId: row.model_photo_id,
    image: Buffer.from(await blob.arrayBuffer()),
  };
}

async function fetchTunedItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<Buffer> {
  const { data: row, error: rowErr } = await supabase
    .from('closet_items')
    .select('tuned_storage_key')
    .eq('item_id', itemId)
    .maybeSingle();
  if (rowErr || !row) {
    throw new Error(`item ${itemId} not found: ${rowErr?.message ?? 'no row'}`);
  }
  const itemRow = row as Pick<ItemRow, 'tuned_storage_key'>;
  if (!itemRow.tuned_storage_key) {
    throw new Error(`item ${itemId} has no tuned image yet (still PROCESSING?)`);
  }
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET_TUNED)
    .download(itemRow.tuned_storage_key);
  if (dlErr || !blob) {
    throw new Error(
      `garment download ${BUCKET_TUNED}/${itemRow.tuned_storage_key} failed: ${dlErr?.message ?? 'no body'}`,
    );
  }
  return Buffer.from(await blob.arrayBuffer());
}

async function fetchItemMeta(
  supabase: SupabaseClient,
  itemId: string,
): Promise<{ name: string; category: ClothingCategory }> {
  const { data: row, error } = await supabase
    .from('closet_items')
    .select('name, category')
    .eq('item_id', itemId)
    .maybeSingle();
  if (error || !row) {
    throw new Error(`item meta ${itemId} not found: ${error?.message ?? 'no row'}`);
  }
  return {
    name: (row as Pick<ItemRow, 'name'>).name,
    category: (row as Pick<ItemRow, 'category'>).category,
  };
}

async function markFailed(
  supabase: SupabaseClient,
  generationId: string,
  detail: string,
  logger: { warn: (m: string, ctx?: object) => void },
): Promise<void> {
  // Trim to 1KB so a verbose Replicate error doesn't blow up the column.
  const trimmed = detail.length > 1024 ? detail.slice(0, 1024) : detail;
  const { error } = await supabase
    .from('tryon_generations')
    .update({
      status: 'FAILED',
      error_detail: trimmed,
      completed_at: new Date().toISOString(),
    })
    .eq('generation_id', generationId);
  if (error) {
    logger.warn('mark-failed update errored', { generationId, err: error.message });
  }
}
