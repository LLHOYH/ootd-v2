// GET /users/:userId — public profile.
//
// SPEC §7.2 (Public profile) + §10.15 (Public profile view) + §12.5
// (Discoverability) + §12.7 (Friend graph visibility).
//
// 404 contract: "returns 404 if not discoverable AND not friends". RLS
// (`users_select_visible`) already encodes the same predicate, so a
// SELECT that returns no row IS the 404 path. We don't need to also
// run `is_friend()` ourselves — we just need its result for the
// `isFriend` flag in the response.
//
// Augmenting fields:
//   - isFriend: from `is_friend(auth.uid(), :userId)`.
//   - hasOutgoingRequest: pending row where I'm the sender.
//   - hasIncomingRequest: pending row where I'm the recipient.
//
// The `PublicProfile` schema in @mei/types/contracts/users does NOT
// currently include profile stats (item count, OOTD count, friend
// count, mutual count). We respect the contract and skip them — adding
// stats here would fail the response validator on the way out.
// TODO(profile-stats): when the schema gains the four counts, wire
// them up here (item count from `closet_items`, OOTD count from
// `ootd_posts`, friend count from `get_friends`, mutual count via
// intersection of `get_friends(:userId)` with `get_friends(auth.uid())`).

import { z } from 'zod';
import type { Handler } from '../../context';
import type { PublicProfile, Tables } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ userId: z.string().uuid() });

type UserRow = Pick<
  Tables<'users'>,
  | 'user_id'
  | 'username'
  | 'display_name'
  | 'avatar_url'
  | 'city'
  | 'country_code'
  | 'style_preferences'
>;

export const getPublicProfileHandler: Handler = async (ctx) => {
  const { userId: meId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { userId } = params;

  // 1. Profile row. RLS does the discoverable + friend + self check;
  //    no row → 404.
  const { data: row, error: userErr } = await supabase
    .from('users')
    .select(
      'user_id, username, display_name, avatar_url, city, country_code, style_preferences',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (userErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load profile: ${userErr.message}`);
  }
  if (!row) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  const profileRow = row as UserRow;

  // 2. Friendship flag — even when looking at yourself, isFriend=false
  //    by convention (§12.7 frames "friend" as the bidirectional graph
  //    edge between distinct users).
  let isFriend = false;
  if (userId !== meId) {
    const { data: friendCheck, error: fErr } = await supabase.rpc('is_friend', {
      a: meId,
      b: userId,
    });
    if (fErr) {
      throw new ApiError(500, 'DB_ERROR', `Friend check failed: ${fErr.message}`);
    }
    isFriend = friendCheck === true;
  }

  // 3. Outstanding request flags. Two queries, each scoped to PENDING.
  //    Skipped when looking at yourself — neither flag is meaningful.
  let hasOutgoingRequest = false;
  let hasIncomingRequest = false;
  if (userId !== meId) {
    const { data: outRow, error: outErr } = await supabase
      .from('friend_requests')
      .select('from_user_id')
      .eq('from_user_id', meId)
      .eq('to_user_id', userId)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (outErr) {
      throw new ApiError(500, 'DB_ERROR', `Outbound request check failed: ${outErr.message}`);
    }
    hasOutgoingRequest = Boolean(outRow);

    const { data: inRow, error: inErr } = await supabase
      .from('friend_requests')
      .select('from_user_id')
      .eq('from_user_id', userId)
      .eq('to_user_id', meId)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (inErr) {
      throw new ApiError(500, 'DB_ERROR', `Inbound request check failed: ${inErr.message}`);
    }
    hasIncomingRequest = Boolean(inRow);
  }

  const profile: PublicProfile = {
    userId: profileRow.user_id,
    username: profileRow.username,
    displayName: profileRow.display_name,
    stylePreferences: profileRow.style_preferences,
    isFriend,
    hasOutgoingRequest,
    hasIncomingRequest,
  };
  if (profileRow.avatar_url) profile.avatarUrl = profileRow.avatar_url;
  if (profileRow.city) profile.city = profileRow.city;
  if (profileRow.country_code) profile.countryCode = profileRow.country_code;

  return { status: 200, body: profile };
};
