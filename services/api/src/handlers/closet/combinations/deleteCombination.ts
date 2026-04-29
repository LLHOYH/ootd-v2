// DELETE /closet/combinations/:comboId — remove a combination.
//
// SPEC §7.2. The `combination_items.combo_id` FK has `on delete
// cascade` (migration 0001 §6.1), so the join rows are removed
// automatically. We use `.select('combo_id')` post-delete to detect
// the no-row case and return 404 instead of the silent 200 supabase-js
// would otherwise produce.

import { z } from 'zod';

import type { DeleteCombinationResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';

const Params = z.object({ comboId: z.string().uuid() });

export const deleteCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { comboId } = params;

  const { data, error } = await supabase
    .from('combinations')
    .delete()
    .eq('user_id', userId)
    .eq('combo_id', comboId)
    .select('combo_id');
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to delete combination: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
  }

  const responseBody: DeleteCombinationResponse = {};
  return { status: 200, body: responseBody };
};
