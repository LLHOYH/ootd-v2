// POST /friends/requests — send a friend request.
//
// SPEC §7.2 (Friends) + §10.12 (Add friends). Body: `{ toUserId }`.
//
// Pre-flight checks (in order):
//   1. Validate the body and reject self-friend (400).
//   2. Reject if the pair is already friends (409).
//   3. Idempotent insert into `friend_requests`. The schema's PK is
//      `(from_user_id, to_user_id)` so a re-send by the same caller
//      no-ops at the DB layer; we use `upsert(..., { ignoreDuplicates })`
//      to convert that into a "return the existing row" semantics
//      rather than surfacing a 23505.
//   4. Reject if the target has an outstanding inbound request to us
//      (409 with INVERSE_REQUEST_EXISTS so the client can prompt
//      "accept this request?"). This is checked AFTER the self/friend
//      checks but BEFORE the insert so we don't race two pending
//      requests in opposite directions.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { FriendRequest, SendFriendRequestResponse } from '@mei/types';
import { SendFriendRequestBody } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

export const sendRequestHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: SendFriendRequestBody }, ctx);
  const toUserId = body.toUserId;

  // 1. Self-friend guard.
  if (toUserId === userId) {
    throw new ApiError(400, 'INVALID', 'Cannot send a friend request to yourself');
  }
  // Defensive UUID shape check — the schema accepts `z.string()`, but the
  // DB column is uuid; bail out cleanly rather than letting Postgres
  // 22P02 us.
  const Uuid = z.string().uuid();
  if (!Uuid.safeParse(toUserId).success) {
    throw new ApiError(400, 'VALIDATION', 'toUserId must be a UUID');
  }

  // 2. Already friends? Use the SQL helper so we don't reimplement the
  //    canonical ordering.
  const { data: areFriends, error: friendErr } = await supabase.rpc(
    'is_friend',
    { a: userId, b: toUserId },
  );
  if (friendErr) {
    throw new ApiError(500, 'DB_ERROR', `Friend check failed: ${friendErr.message}`);
  }
  if (areFriends === true) {
    throw new ApiError(409, 'ALREADY_FRIENDS', 'You are already friends');
  }

  // 3. Pending inverse request? If the target already sent us a request,
  //    we should accept it instead of creating a duplicate-direction one.
  const { data: inverse, error: invErr } = await supabase
    .from('friend_requests')
    .select('from_user_id, to_user_id, status, created_at')
    .eq('from_user_id', toUserId)
    .eq('to_user_id', userId)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (invErr) {
    throw new ApiError(500, 'DB_ERROR', `Inverse request check failed: ${invErr.message}`);
  }
  if (inverse) {
    throw new ApiError(
      409,
      'INVERSE_REQUEST_EXISTS',
      'This user has already sent you a request — accept it instead',
    );
  }

  // 4. Idempotent insert. PK = (from_user_id, to_user_id), so a
  //    re-send by the same caller hits the existing row. We use upsert
  //    with ignoreDuplicates so we always end up with one row and an
  //    explicit status='PENDING' on first send. Re-send while the row
  //    is in DECLINED/CANCELLED won't reopen it — that's intentional;
  //    the recipient should explicitly retry from their side.
  const { data: upserted, error: upsertErr } = await supabase
    .from('friend_requests')
    .upsert(
      {
        from_user_id: userId,
        to_user_id: toUserId,
        status: 'PENDING',
      },
      { onConflict: 'from_user_id,to_user_id', ignoreDuplicates: true },
    )
    .select('from_user_id, to_user_id, status, created_at')
    .maybeSingle();
  if (upsertErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to send request: ${upsertErr.message}`);
  }

  // ignoreDuplicates → the upsert returns no row when a row already
  // existed. Re-fetch so the response always echoes the row.
  let row = upserted as
    | { from_user_id: string; to_user_id: string; status: string; created_at: string }
    | null;
  if (!row) {
    const { data: existing, error: exErr } = await supabase
      .from('friend_requests')
      .select('from_user_id, to_user_id, status, created_at')
      .eq('from_user_id', userId)
      .eq('to_user_id', toUserId)
      .maybeSingle();
    if (exErr) {
      throw new ApiError(500, 'DB_ERROR', `Failed to load request: ${exErr.message}`);
    }
    row = existing as typeof row;
  }
  if (!row) {
    throw new ApiError(500, 'DB_ERROR', 'Failed to persist friend request');
  }

  const response: FriendRequest = {
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status as FriendRequest['status'],
    createdAt: row.created_at,
  };
  const body200: SendFriendRequestResponse = response;
  return { status: 201, body: body200 };
};
