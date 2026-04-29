// POST /friends/requests/:fromUserId/decline — decline an inbound request.
//
// SPEC §7.2 (Friends). UPDATE friend_requests SET status='DECLINED'
// WHERE from_user_id=:fromUserId AND to_user_id=auth.uid() AND
// status='PENDING'. We keep the row (rather than deleting it) so the
// audit trail stays intact and the sender can see the decline reflected
// when they call /friends/requests with status filtering — though for
// v1 that endpoint only returns PENDING.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { DeclineFriendRequestResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ fromUserId: z.string().uuid() });

export const declineRequestHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { fromUserId } = params;

  if (fromUserId === userId) {
    throw new ApiError(400, 'INVALID', 'Cannot decline a request from yourself');
  }

  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'DECLINED' })
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', userId)
    .eq('status', 'PENDING')
    .select('from_user_id')
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to decline request: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'No pending request from that user');
  }

  const body: DeclineFriendRequestResponse = {};
  return { status: 200, body };
};
