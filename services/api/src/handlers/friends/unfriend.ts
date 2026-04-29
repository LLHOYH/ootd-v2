// DELETE /friends/:userId — unfriend.
//
// SPEC §7.2 (Friends) + §12.7 (Friend graph visibility). Deletes the
// canonical (user_a < user_b) friendship row. The
// `friendships_unfriend` RLS policy (0002_rls_policies.sql) lets either
// side issue the delete:
//
//   using (auth.uid() = user_a or auth.uid() = user_b)
//
// We compute the canonical pair on the TS side (mirror of the SQL
// `least/greatest` from `is_friend()`) so the WHERE clause matches at
// most one row, regardless of which side the caller is.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { UnfriendResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { canonicalFriendshipPair } from './shared';

const Params = z.object({ userId: z.string().uuid() });

export const unfriendHandler: Handler = async (ctx) => {
  const { userId: meId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { userId: otherId } = params;

  if (otherId === meId) {
    throw new ApiError(400, 'INVALID', 'Cannot unfriend yourself');
  }

  const pair = canonicalFriendshipPair(meId, otherId);
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a', pair.user_a)
    .eq('user_b', pair.user_b)
    .select('user_a');
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to unfriend: ${error.message}`);
  }
  // `.delete().select()` returns an array of deleted rows. Empty array
  // means there was no friendship to begin with — surface a 404 so the
  // client can clean up its local state without needing the OK case.
  if (!data || data.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Not friends');
  }

  const body: UnfriendResponse = {};
  return { status: 200, body };
};
