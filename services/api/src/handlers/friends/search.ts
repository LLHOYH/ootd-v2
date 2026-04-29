// GET /friends/search?q= — username/displayName search across
// discoverable users.
//
// SPEC §7.2 (Friends) + §12.5 (discoverability). RLS on `users`
// (`users_select_visible`) already filters to "discoverable OR friend OR
// self". We add `discoverable = true` explicitly so the search surface
// returns ONLY discoverable users (the spec restricts search to
// discoverable users, not friends — friends are reachable directly via
// /friends).
//
// Per-row flags (`isFriend`, `hasOutgoingRequest`, `hasIncomingRequest`)
// would be useful in the response, but the SearchFriendsResponse schema
// only contains `items: FriendSummary[]`. We omit the flags from the
// payload and document the gap — the client falls back to /users/{id}
// for the relationship state when the user opens a profile card.

import type { Handler } from '../../context';
import type { SearchFriendsResponse } from '@mei/types';
import { SearchFriendsQuery } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { mapFriendSummary, type UserSummaryRow } from './shared';

const RESULT_LIMIT = 20;

// `SearchFriendsQuery` is `{ q: string.min(1).max(80) }`. Re-export for
// the validator below; we don't need to extend it.
const Query = SearchFriendsQuery;

/**
 * Escape characters that are special inside a Postgres ILIKE pattern.
 * The user-supplied `q` is interpolated into `%${q}%` — without escaping,
 * a literal `%` or `_` lets a malicious caller widen the match scope.
 * (No SQL-injection concern: supabase-js parameterises the value.)
 */
function escapeIlike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const searchHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { query } = validate({ query: Query }, ctx);
  const needle = `%${escapeIlike(query.q)}%`;

  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, display_name, avatar_url, city, country_code')
    .eq('discoverable', true)
    .neq('user_id', userId)
    .or(`username.ilike.${needle},display_name.ilike.${needle}`)
    .limit(RESULT_LIMIT);
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Search failed: ${error.message}`);
  }

  // The contract is just `FriendSummary[]`, so drop the relationship
  // flags. TODO: extend SearchFriendsResponse with per-row flags
  // (isFriend / hasOutgoingRequest / hasIncomingRequest) when the
  // friend-finder UI lands; the joins on `friendships` and
  // `friend_requests` would be 2 extra queries and a per-row merge.
  const items = ((data ?? []) as UserSummaryRow[]).map(mapFriendSummary);
  // Use the imported zod-inferred type directly to keep response shape stable.
  const body: SearchFriendsResponse = { items };
  return { status: 200, body };
};
