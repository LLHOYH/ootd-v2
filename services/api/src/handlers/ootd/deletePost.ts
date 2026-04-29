// DELETE /ootd/:ootdId — owner-only delete.
//
// SPEC §7 (OOTD). The `ootd_posts_owner_delete` RLS policy already
// restricts deletes to `auth.uid() = user_id`; the explicit `user_id`
// equality below is defence-in-depth + lets us tell "no row deleted"
// from "transient error" by checking the returned `data` length, which
// gives a clean 404 instead of the silent 200 the supabase client
// would otherwise produce when RLS filters out every candidate row.
//
// `on delete cascade` on `ootd_reactions.ootd_id` (0001_init_schema.sql)
// drops the reactions automatically; nothing to clean up here.

import { z } from 'zod';

import type { DeleteOotdResponse } from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ ootdId: z.string().uuid() });

export const deletePostHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { ootdId } = params;

  const { data, error } = await supabase
    .from('ootd_posts')
    .delete()
    .eq('ootd_id', ootdId)
    .eq('user_id', userId)
    .select('ootd_id');

  if (error) {
    throw new ApiError(500, 'INTERNAL', `Failed to delete OOTD: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'OOTD not found');
  }

  const responseBody: DeleteOotdResponse = {};
  return { status: 200, body: responseBody };
};
