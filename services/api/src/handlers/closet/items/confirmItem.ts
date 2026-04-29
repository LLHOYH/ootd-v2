// POST /closet/items/:itemId/confirm — mark item as user-confirmed.
//
// SPEC §7.2 + §10.3 (Closet AI Review modal). In the full design this
// flips a `confirmed_at` timestamp on the row so it stops appearing in
// `pending-review`. The current `closet_items` schema has no such
// column, so this is a P0 stub:
//
//   - Validate the item exists and belongs to the caller.
//   - Return the item row unchanged.
//
// TODO(spec): add `confirmed_at timestamptz` to `closet_items` and
// stamp it here. Pair with the matching change in pendingReview.ts.

import { z } from 'zod';

import type { ConfirmItemResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapClosetItem } from '../shared';

const Params = z.object({ itemId: z.string().uuid() });

export const confirmItemHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { itemId } = params;

  const { data, error } = await supabase
    .from('closet_items')
    .select('*')
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
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Closet item not found');
  }

  const responseBody: ConfirmItemResponse = await mapClosetItem(data);
  return { status: 200, body: responseBody };
};
