// POST /model-photo - generate a reusable model photo from the caller's selfies.
//
// Async v1: the API inserts a PENDING row and returns it immediately.
// The image-worker polls PENDING model_photos rows and owns the image
// model call, storage upload, and READY/FAILED promotion.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Handler } from '../../context';
import {
  CreateModelPhotoBody,
  type CreateModelPhotoResponse,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { mapModelPhoto, type ModelPhotoRow } from './shared';

const MODEL_PHOTO_PROMPT_VERSION = 'mei-model-v3-face-anchored';

export const createModelPhotoHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateModelPhotoBody }, ctx);
  const requestedIds = body?.selfieIds;
  const log = (msg: string) => console.log(`[model-photo api] ${msg}`);

  const sourceSelfieIds = await resolveSourceSelfies(
    supabase,
    userId,
    requestedIds,
  );
  if (sourceSelfieIds.length === 0) {
    throw new ApiError(
      400,
      'NO_SELFIES',
      'Add a selfie before generating your model photo.',
    );
  }
  log(`using ${sourceSelfieIds.length} selfie reference(s) for user=${userId.slice(0, 5)}`);

  const { data: insertedRows, error: insertErr } = await supabase
    .from('model_photos')
    .insert({
      user_id: userId,
      source_selfie_ids: sourceSelfieIds,
      status: 'PENDING',
      prompt_version: MODEL_PHOTO_PROMPT_VERSION,
    })
    .select('*')
    .limit(1);
  if (insertErr) {
    throw new ApiError(500, 'DB_ERROR', `insert failed: ${insertErr.message}`);
  }
  const row = ((insertedRows ?? []) as ModelPhotoRow[])[0];
  if (!row) {
    throw new ApiError(500, 'DB_ERROR', 'insert returned no row');
  }
  log(`queued PENDING row ${row.model_photo_id.slice(0, 5)}`);

  const out: CreateModelPhotoResponse = await mapModelPhoto(row);
  return { status: 202, body: out };
};

async function resolveSourceSelfies(
  supabase: SupabaseClient,
  userId: string,
  requestedIds: string[] | undefined,
): Promise<string[]> {
  const uniqueRequested = requestedIds ? Array.from(new Set(requestedIds)) : undefined;
  if (uniqueRequested && uniqueRequested.length > 0) {
    const { data, error } = await supabase
      .from('selfies')
      .select('selfie_id')
      .eq('user_id', userId)
      .in('selfie_id', uniqueRequested);
    if (error) {
      throw new ApiError(500, 'DB_ERROR', `selfie lookup failed: ${error.message}`);
    }
    const found = new Set(((data ?? []) as { selfie_id: string }[]).map((r) => r.selfie_id));
    if (found.size !== uniqueRequested.length) {
      throw new ApiError(404, 'SELFIE_NOT_FOUND', 'One of those selfies was not found.');
    }
    return uniqueRequested;
  }

  const { data, error } = await supabase
    .from('selfies')
    .select('selfie_id')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
    .limit(5);
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `selfie lookup failed: ${error.message}`);
  }
  return ((data ?? []) as { selfie_id: string }[]).map((r) => r.selfie_id);
}
