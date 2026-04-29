// GET /friends — list the caller's accepted friends.
//
// SPEC §7.2 (Friends). Uses the `get_friends(uuid)` SQL helper from
// 0001_init_schema.sql so we don't reimplement the canonical
// `(least, greatest)` ordering on the TS side. The helper returns
// `{ friend_id, friended_at }` rows; we then join to `users` for the
// public summary fields. RLS on `users` (`users_select_visible`) lets
// friends through unconditionally, so the join surface is consistent
// with what the caller is allowed to see.

import type { Handler } from '../../context';
import type { ListFriendsResponse } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { mapFriendSummary, type UserSummaryRow } from './shared';

export const listFriendsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  // 1. Resolve friend IDs via the SQL helper. SECURITY DEFINER, so this
  //    bypasses recursive policy evaluation on `friendships` itself.
  const { data: friendIdRows, error: idsErr } = await supabase.rpc(
    'get_friends',
    { p_user_id: userId },
  );
  if (idsErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load friends: ${idsErr.message}`);
  }
  const rows = (friendIdRows ?? []) as { friend_id: string; friended_at: string }[];
  if (rows.length === 0) {
    const empty: ListFriendsResponse = { items: [] };
    return { status: 200, body: empty };
  }

  // 2. Fan out to `users` for the FriendSummary fields. Order in the
  //    `get_friends` output is by `created_at desc`; we preserve that
  //    here so the most recent friends come first in the UI list.
  const friendIds = rows.map((r) => r.friend_id);
  const { data: userRows, error: usersErr } = await supabase
    .from('users')
    .select('user_id, username, display_name, avatar_url, city, country_code')
    .in('user_id', friendIds);
  if (usersErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load friend profiles: ${usersErr.message}`);
  }
  const userById = new Map<string, UserSummaryRow>();
  for (const u of (userRows ?? []) as UserSummaryRow[]) {
    userById.set(u.user_id, u);
  }

  const items = rows
    .map((r) => userById.get(r.friend_id))
    .filter((u): u is UserSummaryRow => Boolean(u))
    .map(mapFriendSummary);

  const body: ListFriendsResponse = { items };
  return { status: 200, body };
};
