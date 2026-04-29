// POST /closet/combinations — create a combination.
//
// SPEC §7.2 + §6.2. Body shape: `{ name?, itemIds, occasionTags?, source }`.
// `itemIds.length` is constrained to 2–6 by the contract Zod schema.
// We do the insert in two steps:
//
//   1. Insert the `combinations` row → get the generated `combo_id`.
//   2. Bulk-insert `combination_items` rows with explicit positions (the
//      array index is the rendering order — Stella, Crafter etc. all
//      depend on a stable position).
//
// Two-step (not a single transaction) is acceptable for v1: if step 2
// fails after step 1 we leave a comborow with no items — the spec's
// strict 2–6-item invariant says that's invalid. Cleanup is best-effort
// in the catch arm. A proper Postgres function would be tidier; flagged
// below.
//
// TODO(combo-create-tx): wrap insert + items insert in a Postgres
// function (RPC) so a failure rolls back atomically. P1.

import {
  CreateCombinationBody,
  type CreateCombinationResponse,
  type Tables,
} from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapCombination } from '../shared';

export const createCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateCombinationBody }, ctx);

  // 1. Insert the combination row.
  const insertCombo = {
    user_id: userId,
    name: body.name ?? 'New combination',
    occasion_tags: body.occasionTags ?? [],
    source: body.source,
  };

  const { data: comboRow, error: comboErr } = await supabase
    .from('combinations')
    .insert(insertCombo)
    .select('*')
    .single();
  if (comboErr || !comboRow) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to create combination: ${comboErr?.message ?? 'no row returned'}`,
    );
  }

  const comboId = comboRow.combo_id;

  // 2. Bulk-insert combination_items. Order by array index → position.
  const itemRows = body.itemIds.map((itemId, position) => ({
    combo_id: comboId,
    item_id: itemId,
    position,
  }));

  const { error: itemsErr } = await supabase
    .from('combination_items')
    .insert(itemRows);
  if (itemsErr) {
    // Best-effort cleanup of the half-created combination so we don't
    // leave an empty combo around. RLS lets the owner delete it; if
    // even that fails, log it but surface the original error to the
    // caller (which is the actionable one).
    await supabase.from('combinations').delete().eq('combo_id', comboId);
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to attach items to combination: ${itemsErr.message}`,
    );
  }

  const responseBody: CreateCombinationResponse = mapCombination({
    row: comboRow as Tables<'combinations'>,
    items: itemRows.map((r) => ({ item_id: r.item_id, position: r.position })),
  });
  return { status: 201, body: responseBody };
};
