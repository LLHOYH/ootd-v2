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
const BATCH_SIZE = 3;

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
      await Promise.all([
        drainModelPhotos(cfg, supabase, logger, inFlightModelPhotos),
        drainTryons(cfg, supabase, logger, inFlightTryons),
      ]);
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
): Promise<void> {
  const { data, error } = await supabase
    .from('model_photos')
    .select('model_photo_id, user_id')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    logger.warn({ err: error.message }, 'pending model-photo lookup failed');
    return;
  }

  const rows = ((data ?? []) as PendingModelPhotoRow[]).filter(
    (row) => !inFlight.has(row.model_photo_id),
  );
  for (const row of rows) {
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
  }
}

async function drainTryons(
  cfg: ImageWorkerConfig,
  supabase: SupabaseClient,
  logger: Logger,
  inFlight: Set<string>,
): Promise<void> {
  const { data, error } = await supabase
    .from('tryon_generations')
    .select('generation_id, user_id, selfie_id, item_id, provider_id')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    logger.warn({ err: error.message }, 'pending try-on lookup failed');
    return;
  }

  const rows = ((data ?? []) as PendingTryonRow[]).filter(
    (row) => !inFlight.has(row.generation_id),
  );
  for (const row of rows) {
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
  }
}

function queuedProviderPrefersModel(providerId: string | null): boolean {
  // New async rows are stamped as:
  //   tryon:nano-v1:queued:model:<modelPhotoId>
  //   tryon:nano-v1:queued:selfie:<selfieId>
  // Older PENDING rows predate the stamp; the current product default is
  // model-photo try-ons, so those should prefer model too.
  if (!providerId) return true;
  return !providerId.includes(':queued:selfie:');
}
