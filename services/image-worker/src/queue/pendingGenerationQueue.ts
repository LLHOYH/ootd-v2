// pendingGenerationQueue - lightweight DB-backed generation queue.
//
// The durable queue is the existing status columns:
//   model_photos.status = PENDING
//   tryon_generations.status = PENDING
//
// The API inserts those rows and returns immediately. This worker polls
// the pending rows, runs the same pipelines the HTTP routes use, and the
// pipelines promote each row to READY or FAILED.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImageWorkerConfig } from '../config';
import { generateModelPhoto } from '../pipeline/generateModelPhoto';
import { generateTryon } from '../pipeline/generateTryon';

const DEFAULT_POLL_MS = 3_000;

interface Logger {
  info: (ctx: object, msg?: string) => void;
  warn: (ctx: object, msg?: string) => void;
  error: (ctx: object, msg?: string) => void;
}

interface PendingModelPhotoRow {
  model_photo_id: string;
  user_id: string;
}

interface PendingTryonRow {
  generation_id: string;
  user_id: string;
  selfie_id: string;
  combo_id: string;
  item_id: string;
  provider_id: string | null;
}

export function startPendingGenerationQueue(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  logger: Logger,
): () => void {
  const pollMs = Number(process.env.IMAGE_WORKER_QUEUE_POLL_MS ?? DEFAULT_POLL_MS);
  const inFlightModelPhotos = new Set<string>();
  const inFlightTryons = new Set<string>();
  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      if (inFlightModelPhotos.size > 0 || inFlightTryons.size > 0) return;
      const startedModelPhoto = await drainModelPhotos(cfg, supabase, logger, inFlightModelPhotos);
      if (!startedModelPhoto) {
        await drainTryons(cfg, supabase, logger, inFlightTryons);
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'pending generation queue tick failed',
      );
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(1_000, pollMs));
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function drainModelPhotos(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  logger: Logger,
  inFlight: Set<string>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('model_photos')
    .select('model_photo_id, user_id')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    logger.warn({ err: error.message }, 'pending model-photo lookup failed');
    return false;
  }

  const row = ((data ?? []) as PendingModelPhotoRow[]).filter(
    (row) => !inFlight.has(row.model_photo_id),
  )[0];
  if (!row) return false;

  inFlight.add(row.model_photo_id);
  void generateModelPhoto(cfg, supabase, {
    modelPhotoId: row.model_photo_id,
    userId: row.user_id,
  }, {
    info: (m, c) => logger.info(c ?? {}, m),
    warn: (m, c) => logger.warn(c ?? {}, m),
    error: (m, c) => logger.error(c ?? {}, m),
  }).finally(() => {
    inFlight.delete(row.model_photo_id);
  });
  return true;
}

async function drainTryons(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  logger: Logger,
  inFlight: Set<string>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tryon_generations')
    .select('generation_id, user_id, selfie_id, combo_id, item_id, provider_id')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    logger.warn({ err: error.message }, 'pending try-on lookup failed');
    return false;
  }

  const row = ((data ?? []) as PendingTryonRow[]).filter(
    (row) => !inFlight.has(row.generation_id),
  )[0];
  if (!row) return false;

  const promoted = await promoteFromCachedReady(supabase, logger, row);
  if (promoted) return true;

  inFlight.add(row.generation_id);
  void generateTryon(cfg, supabase, {
    generationId: row.generation_id,
    userId: row.user_id,
    selfieId: row.selfie_id,
    itemId: row.item_id,
    preferModelPhoto: queuedProviderPrefersModel(row.provider_id),
  }, {
    info: (m, c) => logger.info(c ?? {}, m),
    warn: (m, c) => logger.warn(c ?? {}, m),
    error: (m, c) => logger.error(c ?? {}, m),
  }).finally(() => {
    inFlight.delete(row.generation_id);
  });
  return true;
}

async function promoteFromCachedReady(
  supabase: SupabaseClient,
  logger: Logger,
  row: PendingTryonRow,
): Promise<boolean> {
  const providerPattern = readyProviderPatternFromQueued(row.provider_id);
  if (!providerPattern) return false;

  const { data, error } = await supabase
    .from('tryon_generations')
    .select('generated_storage_key, provider_id')
    .eq('user_id', row.user_id)
    .eq('selfie_id', row.selfie_id)
    .eq('combo_id', row.combo_id)
    .eq('item_id', row.item_id)
    .eq('status', 'READY')
    .like('provider_id', providerPattern)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error) {
    logger.warn({ err: error.message, generationId: row.generation_id }, 'cached try-on lookup failed');
    return false;
  }
  const cached = ((data ?? []) as {
    generated_storage_key: string | null;
    provider_id: string | null;
  }[])[0];
  if (!cached?.generated_storage_key) return false;

  const { error: updateErr } = await supabase
    .from('tryon_generations')
    .update({
      status: 'READY',
      generated_storage_key: cached.generated_storage_key,
      provider_id: cached.provider_id,
      completed_at: new Date().toISOString(),
    })
    .eq('generation_id', row.generation_id);
  if (updateErr) {
    logger.warn({ err: updateErr.message, generationId: row.generation_id }, 'cached try-on promotion failed');
    return false;
  }
  logger.info({ generationId: row.generation_id }, 'promoted duplicate try-on from cached READY row');
  return true;
}

function queuedProviderPrefersModel(providerId: string | null): boolean {
  // New async rows are stamped as:
  //   tryon:nano-v2:queued:model:<modelPhotoId>
  //   tryon:nano-v2:queued:selfie:<selfieId>
  // Older PENDING rows predate the stamp; the current product default is
  // model-photo try-ons, so those should prefer model too.
  if (!providerId) return true;
  return !providerId.includes(':queued:selfie:');
}

function readyProviderPatternFromQueued(providerId: string | null): string | null {
  if (!providerId) return null;
  if (providerId.includes(':queued:model:')) {
    return `${providerId.replace(':queued:model:', ':model:')}:%`;
  }
  if (providerId.includes(':queued:selfie:')) {
    return `${providerId.replace(':queued:selfie:', ':selfie:')}:%`;
  }
  return null;
}
