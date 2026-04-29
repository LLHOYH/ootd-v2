// GET /friends/requests — inbound + outbound pending requests.
//
// SPEC §7.2 (Friends). Two queries: one for rows where the caller is the
// recipient (`inbound`), one where the caller is the sender (`outbound`).
// Both filter to `status = 'PENDING'` per the contract — the response
// type is "open" requests only. Each row is enriched with the
// counterparty's `FriendSummary` for the UI.
//
// We rely on RLS (`friend_requests_select_either`) to gate the rows;
// the explicit `eq` clauses are belt-and-braces in case the policy
// changes.

import type { Handler } from '../../context';
import type {
  FriendRequest,
  FriendRequestWithUser,
  ListFriendRequestsResponse,
  Tables,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { mapFriendSummary, type UserSummaryRow } from './shared';

type RequestRow = Tables<'friend_requests'>;

function mapBareRequest(row: RequestRow): FriendRequest {
  return {
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status as FriendRequest['status'],
    createdAt: row.created_at,
  };
}

export const listRequestsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  // Inbound — rows where I'm the recipient.
  const { data: inboundRows, error: inErr } = await supabase
    .from('friend_requests')
    .select('from_user_id, to_user_id, status, created_at')
    .eq('to_user_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (inErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load inbound: ${inErr.message}`);
  }

  // Outbound — rows where I'm the sender.
  const { data: outboundRows, error: outErr } = await supabase
    .from('friend_requests')
    .select('from_user_id, to_user_id, status, created_at')
    .eq('from_user_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (outErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load outbound: ${outErr.message}`);
  }

  const inbound = (inboundRows ?? []) as RequestRow[];
  const outbound = (outboundRows ?? []) as RequestRow[];

  // Collect every counterparty userId so we can fetch their `FriendSummary`
  // fields in a single round-trip.
  const counterIds = new Set<string>();
  for (const r of inbound) counterIds.add(r.from_user_id);
  for (const r of outbound) counterIds.add(r.to_user_id);

  const userById = new Map<string, UserSummaryRow>();
  if (counterIds.size > 0) {
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('user_id, username, display_name, avatar_url, city, country_code')
      .in('user_id', [...counterIds]);
    if (usersErr) {
      throw new ApiError(500, 'DB_ERROR', `Failed to load users: ${usersErr.message}`);
    }
    for (const u of (users ?? []) as UserSummaryRow[]) {
      userById.set(u.user_id, u);
    }
  }

  function withUser(row: RequestRow, otherId: string): FriendRequestWithUser | null {
    const u = userById.get(otherId);
    if (!u) {
      // RLS may hide a user we're allowed to see the request for (e.g.
      // a user who later toggled discoverable=false but is not yet a
      // friend). Drop the row from the response rather than 500ing.
      return null;
    }
    return { ...mapBareRequest(row), user: mapFriendSummary(u) };
  }

  const body: ListFriendRequestsResponse = {
    inbound: inbound
      .map((r) => withUser(r, r.from_user_id))
      .filter((r): r is FriendRequestWithUser => r !== null),
    outbound: outbound
      .map((r) => withUser(r, r.to_user_id))
      .filter((r): r is FriendRequestWithUser => r !== null),
  };
  return { status: 200, body };
};
