// DELETE /closet/items/:itemId — remove a closet item.
//
// SPEC §7.2. The `combination_items.item_id` FK has `on delete cascade`
// (migration 0001 §6.1), so any combinations referencing this item lose
// the corresponding combination_items row automatically. Combinations
// can drop below the 2-item minimum as a result; we accept that for v1
// (the spec doesn't mandate combination cleanup on item delete), but
// it's worth flagging.
//
// TODO(combination-min-items): on item delete, find combinations whose
// item count drops below 2 and either delete the combination or surface
// it for user repair. Out of scope for P0.
//
// We intentionally do NOT delete the underlying Storage objects from
// here. The image-worker owns the `closet-tuned` bucket and the raw
// upload may still be in flight; a Storage cleanup pass should happen
// asynchronously on a `closet_items` DELETE trigger or scheduled job.
// TODO(storage-cleanup): orphaned closet-raw / closet-tuned objects
// after item delete need a sweeper.

import { z } from 'zod';

import type { DeleteItemResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';

const Params = z.object({ itemId: z.string().uuid() });

export const deleteItemHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { itemId } = params;

  const { data, error } = await supabase
    .from('closet_items')
    .delete()
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .select('item_id');
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to delete closet item: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Closet item not found');
  }

  const responseBody: DeleteItemResponse = {};
  return { status: 200, body: responseBody };
};
