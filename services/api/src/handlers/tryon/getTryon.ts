// GET /tryon/:id — read a single try-on generation.
//
// Used by the mobile cache layer to surface a previously-completed
// generation without spending another Replicate call, and as a polling
// target if v2 moves to async generation. RLS ensures the caller can
// only read their own rows.

import type { Handler } from '../../context';
import {
  tryonGeneratedKey,
  type GetTryonResponse,
  type Tables,
  type TryonGeneration,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { signDownloadUrl } from '../../lib/storage';

type GenerationRow = Tables<'tryon_generations'>;

export const getTryonHandler: Handler = async (ctx) => {
  const { supabase } = requireAuthCtx(ctx);
  const id = ctx.params['id'];
  if (!id || typeof id !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', 'Missing generation id');
  }

  const { data, error } = await supabase
    .from('tryon_generations')
    .select('*')
    .eq('generation_id', id)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `read failed: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Generation not found');
  }

  const row = data as GenerationRow;
  const out: TryonGeneration = {
    generationId: row.generation_id,
    userId: row.user_id,
    selfieId: row.selfie_id,
    comboId: row.combo_id,
    itemId: row.item_id,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.completed_at) out.completedAt = row.completed_at;
  if (row.error_detail) out.errorDetail = row.error_detail;
  if (row.status === 'READY' && row.generated_storage_key) {
    try {
      out.imageUrl = await signDownloadUrl({
        bucket: 'tryon-generated',
        path: row.generated_storage_key,
      });
    } catch {
      // leave undefined
    }
  }

  return { status: 200, body: out };
};
