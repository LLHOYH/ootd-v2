// generateModelPhoto - turn uploaded selfies into a reusable model photo.

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { modelPhotoKey } from '@mei/types';
import type { ImageWorkerConfig } from '../config';
import { getModelPhotoProvider } from '../providers/modelPhoto';

const BUCKET_SELFIES = 'selfies';
const BUCKET_MODEL_PHOTOS = 'model-photos';

export interface GenerateModelPhotoInput {
  modelPhotoId: string;
  userId: string;
}

export interface GenerateModelPhotoResult {
  status: 'ready' | 'already-ready' | 'failed';
  modelPhotoId: string;
  storageKey?: string;
  providerId?: string;
  detail?: string;
}

interface ModelPhotoRow {
  model_photo_id: string;
  user_id: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  source_selfie_ids: string[] | null;
}

interface SelfieRow {
  selfie_id: string;
  storage_key: string;
}

export async function generateModelPhoto(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  input: GenerateModelPhotoInput,
  logger: {
    info: (m: string, ctx?: object) => void;
    warn: (m: string, ctx?: object) => void;
    error: (m: string, ctx?: object) => void;
  } = console,
): Promise<GenerateModelPhotoResult> {
  const t0 = Date.now();
  const shortId = input.modelPhotoId.slice(0, 5);
  const ctx = { ...input };
  const step = (msg: string) => console.log(`[model-photo ${shortId}] ${msg}`);
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

  step(`received request (user=${input.userId.slice(0, 5)})`);

  const { data: rowData, error: rowErr } = await supabase
    .from('model_photos')
    .select('model_photo_id, user_id, status, source_selfie_ids')
    .eq('model_photo_id', input.modelPhotoId)
    .maybeSingle();
  if (rowErr) {
    logger.error('model photo row lookup failed', { ...ctx, err: rowErr.message });
    return { status: 'failed', modelPhotoId: input.modelPhotoId, detail: rowErr.message };
  }
  if (!rowData) {
    return { status: 'failed', modelPhotoId: input.modelPhotoId, detail: 'no row' };
  }

  const row = rowData as ModelPhotoRow;
  if (row.user_id !== input.userId) {
    return { status: 'failed', modelPhotoId: input.modelPhotoId, detail: 'user mismatch' };
  }
  if (row.status === 'READY') {
    return { status: 'already-ready', modelPhotoId: input.modelPhotoId };
  }

  try {
    const selfieIds = row.source_selfie_ids ?? [];
    if (selfieIds.length === 0) {
      throw new Error('model photo has no source selfies');
    }

    step(`loading ${selfieIds.length} selfie reference(s) from Supabase...`);
    const rawSelfies = await fetchSelfies(supabase, input.userId, selfieIds);
    step(`got ${rawSelfies.length} selfie reference(s)`);

    step('building face identity crops and full-person references...');
    const identityRefs = await Promise.all(rawSelfies.map(makeIdentityReference));
    const fullRefs = await Promise.all(rawSelfies.map(makeFullReference));
    const modelRefs = [...identityRefs, ...fullRefs];

    const provider = getModelPhotoProvider(cfg);
    step(`generating model photo (${cfg.mode === 'real' && cfg.replicateApiToken ? 'real' : 'mock'} provider)...`);
    const out = await provider.generate({
      selfies: modelRefs,
      identityReferenceCount: identityRefs.length,
      logTag: shortId,
    });

    step('encoding generated model photo to WebP (q=88)...');
    const webp = await sharp(out.image).rotate().webp({ quality: 88 }).toBuffer();
    const key = modelPhotoKey(input.userId, input.modelPhotoId).path;
    step(`uploading ${(webp.length / 1024).toFixed(0)} KB to ${BUCKET_MODEL_PHOTOS}/${key}...`);
    const uploadRes = await supabase.storage
      .from(BUCKET_MODEL_PHOTOS)
      .upload(key, webp, { contentType: 'image/webp', upsert: true });
    if (uploadRes.error) {
      throw new Error(
        `upload ${BUCKET_MODEL_PHOTOS}/${key} failed: ${uploadRes.error.message}`,
      );
    }

    step('marking model photo READY in DB');
    const { error: upErr } = await supabase
      .from('model_photos')
      .update({
        status: 'READY',
        storage_key: key,
        provider_id: out.providerId ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('model_photo_id', input.modelPhotoId);
    if (upErr) {
      throw new Error(`row update failed: ${upErr.message}`);
    }

    step(`complete in ${elapsed()}s`);
    return {
      status: 'ready',
      modelPhotoId: input.modelPhotoId,
      storageKey: key,
      providerId: out.providerId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed';
    step(`failed after ${elapsed()}s: ${msg}`);
    logger.error('model photo generation failed', { ...ctx, err: msg });
    await markFailed(supabase, input.modelPhotoId, msg, logger);
    return { status: 'failed', modelPhotoId: input.modelPhotoId, detail: msg };
  }
}

async function fetchSelfies(
  supabase: SupabaseClient,
  userId: string,
  selfieIds: string[],
): Promise<Buffer[]> {
  const { data, error } = await supabase
    .from('selfies')
    .select('selfie_id, storage_key')
    .eq('user_id', userId)
    .in('selfie_id', selfieIds);
  if (error) {
    throw new Error(`selfie lookup failed: ${error.message}`);
  }

  const byId = new Map(
    ((data ?? []) as SelfieRow[]).map((row) => [row.selfie_id, row.storage_key] as const),
  );
  const buffers: Buffer[] = [];
  for (const selfieId of selfieIds) {
    const storageKey = byId.get(selfieId);
    if (!storageKey) {
      throw new Error(`selfie ${selfieId} not found`);
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_SELFIES)
      .download(storageKey);
    if (dlErr || !blob) {
      throw new Error(
        `selfie download ${BUCKET_SELFIES}/${storageKey} failed: ${dlErr?.message ?? 'no body'}`,
      );
    }
    buffers.push(Buffer.from(await blob.arrayBuffer()));
  }
  return buffers;
}

async function makeIdentityReference(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: 'cover',
      position: 'north',
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function makeFullReference(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

async function markFailed(
  supabase: SupabaseClient,
  modelPhotoId: string,
  detail: string,
  logger: { warn: (m: string, ctx?: object) => void },
): Promise<void> {
  const trimmed = detail.length > 1024 ? detail.slice(0, 1024) : detail;
  const { error } = await supabase
    .from('model_photos')
    .update({
      status: 'FAILED',
      error_detail: trimmed,
      completed_at: new Date().toISOString(),
    })
    .eq('model_photo_id', modelPhotoId);
  if (error) {
    logger.warn('mark-failed update errored', { modelPhotoId, err: error.message });
  }
}
