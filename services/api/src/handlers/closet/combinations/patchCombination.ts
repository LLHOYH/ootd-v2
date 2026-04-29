// PATCH /closet/combinations/:comboId — update name, items, or tags.
//
// SPEC §7.2. Body shape is partial: any subset of `{ name, itemIds,
// occasionTags }` may be sent. When `itemIds` is provided we replace
// the `combination_items` rows entirely (delete-all-then-bulk-insert);
// the spec doesn't model "add this item" / "remove that item" as
// separate operations, so the simplest correct implementation is a
// full replacement keyed off the new array.
//
// Like createCombination this is two-step (or three, with the items
// replacement) and not transactional. If the items-replacement fails
// after the row update, we'll have stale `combination_items` rows.
// TODO(combo-patch-tx): wrap into an RPC for atomicity. P1.

import { z } from 'zod';

import {
  UpdateCombinationBody,
  type UpdateCombinationResponse,
  type Tables,
} from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapCombination, type CombinationWithItems } from '../shared';

const Params = z.object({ comboId: z.string().uuid() });

type ComboRow = Tables<'combinations'> & {
  combination_items: { item_id: string; position: number }[] | null;
};

export const patchCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params, body } = validate(
    { params: Params, body: UpdateCombinationBody },
    ctx,
  );
  const { comboId } = params;

  // 1. Decide whether we need to update the combinations row at all.
  //    Only `name` and `occasion_tags` live there; `itemIds` lives on
  //    `combination_items`.
  const update: { name?: string; occasion_tags?: typeof body.occasionTags } = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.occasionTags !== undefined) update.occasion_tags = body.occasionTags;

  if (Object.keys(update).length > 0) {
    const { error: updErr, data: updData } = await supabase
      .from('combinations')
      .update(update)
      .eq('user_id', userId)
      .eq('combo_id', comboId)
      .select('combo_id');
    if (updErr) {
      throw new ApiError(
        500,
        'INTERNAL',
        `Failed to update combination: ${updErr.message}`,
      );
    }
    if (!updData || updData.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
    }
  } else {
    // No row-level fields are changing; still verify ownership so we
    // can surface a clean 404 before touching combination_items.
    const { data: ownRow, error: ownErr } = await supabase
      .from('combinations')
      .select('combo_id')
      .eq('user_id', userId)
      .eq('combo_id', comboId)
      .maybeSingle();
    if (ownErr) {
      throw new ApiError(
        500,
        'INTERNAL',
        `Failed to verify combination: ${ownErr.message}`,
      );
    }
    if (!ownRow) {
      throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
    }
  }

  // 2. Replace combination_items if the caller sent itemIds.
  if (body.itemIds !== undefined) {
    const { error: delErr } = await supabase
      .from('combination_items')
      .delete()
      .eq('combo_id', comboId);
    if (delErr) {
      throw new ApiError(
        500,
        'INTERNAL',
        `Failed to clear combination items: ${delErr.message}`,
      );
    }

    const newItems = body.itemIds.map((itemId, position) => ({
      combo_id: comboId,
      item_id: itemId,
      position,
    }));
    const { error: insErr } = await supabase
      .from('combination_items')
      .insert(newItems);
    if (insErr) {
      throw new ApiError(
        500,
        'INTERNAL',
        `Failed to insert combination items: ${insErr.message}`,
      );
    }
  }

  // 3. Re-read for the response so the shape matches getCombination.
  const { data: finalRow, error: finalErr } = await supabase
    .from('combinations')
    .select(
      `combo_id,
       user_id,
       name,
       occasion_tags,
       source,
       created_at,
       combination_items (
         item_id,
         position
       )`,
    )
    .eq('user_id', userId)
    .eq('combo_id', comboId)
    .maybeSingle();
  if (finalErr) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to reload combination: ${finalErr.message}`,
    );
  }
  if (!finalRow) {
    throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
  }

  const row = finalRow as unknown as ComboRow;
  const withItems: CombinationWithItems = {
    row: {
      combo_id: row.combo_id,
      user_id: row.user_id,
      name: row.name,
      occasion_tags: row.occasion_tags,
      source: row.source,
      created_at: row.created_at,
    },
    items: row.combination_items ?? [],
  };

  const responseBody: UpdateCombinationResponse = mapCombination(withItems);
  return { status: 200, body: responseBody };
};
