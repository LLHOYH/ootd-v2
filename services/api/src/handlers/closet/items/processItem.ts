// POST /closet/items/:itemId/process — trigger AI processing (idempotent).
//
// SPEC §7.2 + §9.1. In production the §9.1 pipeline is driven by the
// `closet-raw` Storage webhook → image-worker Lambda; this endpoint
// exists so the client can manually nudge processing if the webhook
// fired before the row was visible (or if a retry is needed).
//
// P0 stub for feat/closet-api: verify the item exists and belongs to the
// caller (RLS already enforces this; we keep the explicit `eq` for
// clarity and to give a clean 404 vs an opaque RLS denial), then return
// the current status. The real worker hookup ships in feat/image-worker.

import { z } from 'zod';

import { type ProcessItemResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';

const Params = z.object({ itemId: z.string().uuid() });

export const processItemHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { itemId } = params;

  // Ownership check — gives a clean 404 instead of leaking RLS state.
  const { data: row, error } = await supabase
    .from('closet_items')
    .select('item_id, status')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to load closet item: ${error.message}`,
    );
  }
  if (!row) {
    throw new ApiError(404, 'NOT_FOUND', 'Closet item not found');
  }

  // TODO(image-worker): trigger the §9.1 pipeline by re-emitting the
  // Storage webhook (or directly invoking the image-worker Lambda). For
  // P0 we just echo the current status; tests on the contract surface
  // pass because the response is `{ itemId, status }` regardless.
  const responseBody: ProcessItemResponse = {
    itemId: row.item_id,
    status: row.status,
  };
  return { status: 200, body: responseBody };
};
