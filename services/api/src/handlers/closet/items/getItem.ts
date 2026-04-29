// GET /closet/items/:itemId — fetch a single closet item.
//
// SPEC §7.2. RLS auto-scopes to the caller; we add an explicit `eq` on
// `user_id` for clarity and treat a missing row as 404 regardless of
// whether it doesn't exist or belongs to another user (don't leak
// existence — same approach as Stella's getConversation).

import { z } from 'zod';

import type { GetItemResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapClosetItem } from '../shared';

const Params = z.object({ itemId: z.string().uuid() });

export const getItemHandler: Handler = async (ctx) => {
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

  const body: GetItemResponse = await mapClosetItem(data);
  return { status: 200, body };
};
