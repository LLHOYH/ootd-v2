// GET /model-photo - return the caller's latest model photo, if any.

import type { Handler } from '../../context';
import type { GetModelPhotoResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { mapModelPhoto, readLatestModelPhoto } from './shared';

export const getModelPhotoHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  let row;
  try {
    row = await readLatestModelPhoto(supabase, userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'model photo lookup failed';
    throw new ApiError(500, 'DB_ERROR', msg);
  }

  const body: GetModelPhotoResponse = {};
  if (row) body.latest = await mapModelPhoto(row);
  return { status: 200, body };
};
