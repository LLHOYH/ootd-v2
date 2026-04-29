// GET /closet/combinations/:comboId — fetch a combination + its items.
//
// SPEC §7.2. Same join pattern as listCombinations — the response
// includes `itemIds[]` which we materialise from `combination_items`.
// 404 if the row is missing or RLS-hidden (don't leak existence).

import { z } from 'zod';

import type { GetCombinationResponse, Tables } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapCombination, type CombinationWithItems } from '../shared';

const Params = z.object({ comboId: z.string().uuid() });

type ComboRow = Tables<'combinations'> & {
  combination_items: { item_id: string; position: number }[] | null;
};

export const getCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { comboId } = params;

  const { data, error } = await supabase
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
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to load combination: ${error.message}`,
    );
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
  }

  const row = data as unknown as ComboRow;
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

  const responseBody: GetCombinationResponse = mapCombination(withItems);
  return { status: 200, body: responseBody };
};
