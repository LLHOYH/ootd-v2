// DELETE /friends/requests/:toUserId — cancel an outbound request.
//
// SPEC §7.2 (Friends). The spec verb is "cancel"; we transition the
// row to status='CANCELLED' rather than deleting it so the audit trail
// stays intact (consistent with decline). The spec sentence "cancel an
// outbound request" leaves the storage shape open; CANCELLED matches
// the existing `friend_request_status` enum and is what the mock-server
// emits for parity.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { CancelFriendRequestResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ toUserId: z.string().uuid() });

export const cancelRequestHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { toUserId } = params;

  if (toUserId === userId) {
    throw new ApiError(400, 'INVALID', 'Cannot cancel a request to yourself');
  }

  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'CANCELLED' })
    .eq('from_user_id', userId)
    .eq('to_user_id', toUserId)
    .eq('status', 'PENDING')
    .select('from_user_id')
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to cancel request: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'No pending outbound request to that user');
  }

  const body: CancelFriendRequestResponse = {};
  return { status: 200, body };
};
