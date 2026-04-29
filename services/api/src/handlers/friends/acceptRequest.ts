// POST /friends/requests/:fromUserId/accept — accept an inbound request.
//
// SPEC §7.2 (Friends). Two-step write:
//   1. UPDATE friend_requests SET status='ACCEPTED' WHERE
//      from_user_id=:fromUserId AND to_user_id=auth.uid() AND
//      status='PENDING'.
//   2. INSERT INTO friendships (canonical user_a, user_b)
//      ON CONFLICT DO NOTHING.
//
// Idempotent: replay returns the existing friendship and the
// already-accepted request. We use `select(...).maybeSingle()` after the
// update to differentiate "no such pending request" (404) from "happy
// path".
//
// TODO: wrap both writes in a Postgres function and invoke via
// `supabase.rpc('accept_friend_request', { p_from: $1 })` so the two
// steps are transactional. For v1 the race window is "request accepted
// but friendship insert failed" — the friendship insert is idempotent,
// and a re-call recovers; the in-between state is a stale
// status='ACCEPTED' row with no friendship, which the listRequests
// query already filters out.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { AcceptFriendRequestResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { getSupabaseAdmin } from '../../lib/supabase';
import { validate } from '../../middleware/validate';
import { canonicalFriendshipPair, mapFriendSummary, type UserSummaryRow } from './shared';

const Params = z.object({ fromUserId: z.string().uuid() });

export const acceptRequestHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { fromUserId } = params;

  if (fromUserId === userId) {
    throw new ApiError(400, 'INVALID', 'Cannot accept a request from yourself');
  }

  // 1. Update the pending row. We use `.select().maybeSingle()` so the
  //    affected row is returned in a single round-trip.
  const { data: updated, error: upErr } = await supabase
    .from('friend_requests')
    .update({ status: 'ACCEPTED' })
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', userId)
    .eq('status', 'PENDING')
    .select('from_user_id, to_user_id, status, created_at')
    .maybeSingle();
  if (upErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to accept request: ${upErr.message}`);
  }
  if (!updated) {
    // Could mean (a) no such pending request, or (b) the request was
    // already accepted/declined. Either way: 404 from the caller's
    // perspective. The friendship insert below still runs idempotently
    // in case (b) — but only if we know they're already friends, which
    // is the normal replay case.
    const { data: existing } = await supabase
      .from('friend_requests')
      .select('status')
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', userId)
      .maybeSingle();
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'No pending request from that user');
    }
    if (existing.status !== 'ACCEPTED') {
      throw new ApiError(
        409,
        'INVALID_STATE',
        `Request is already ${existing.status.toLowerCase()}`,
      );
    }
    // Fall through — already accepted; treat as idempotent replay.
  }

  // 2. Insert the friendship row in canonical (user_a < user_b) order.
  //    `on conflict do nothing` keeps replays from 23505ing.
  //
  //    `friendships` has no INSERT policy by design — the migration
  //    comment in 0002_rls_policies.sql calls out that "friendships
  //    are written by the API (after a request is accepted) using the
  //    service role." We've already authorised this caller against the
  //    PENDING `friend_requests` row above, so the service-role insert
  //    here is gated by application logic rather than RLS.
  const pair = canonicalFriendshipPair(userId, fromUserId);
  const admin = getSupabaseAdmin();
  const { error: insErr } = await admin
    .from('friendships')
    .upsert(pair, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
  if (insErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to create friendship: ${insErr.message}`);
  }

  // 3. Hydrate the new friend's public summary for the response.
  const { data: friendRow, error: fErr } = await supabase
    .from('users')
    .select('user_id, username, display_name, avatar_url, city, country_code')
    .eq('user_id', fromUserId)
    .maybeSingle();
  if (fErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load friend: ${fErr.message}`);
  }
  if (!friendRow) {
    // Friend exists in `friendships` but not visible here? Shouldn't
    // happen — `users_select_visible` lets us through because we're
    // now friends. Surface a clean 500 rather than misleading data.
    throw new ApiError(500, 'DB_ERROR', 'Friend row not loadable after accept');
  }
  const body: AcceptFriendRequestResponse = {
    friend: mapFriendSummary(friendRow as UserSummaryRow),
  };
  return { status: 200, body };
};
