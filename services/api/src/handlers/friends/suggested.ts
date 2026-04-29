// GET /friends/suggested — friend suggestions for the caller.
//
// SPEC §7.2 (Friends) + §13.1 (P0 ships search + contacts only; Suggested
// is P1). Stubbed to an empty list so the screen renders without
// special-casing the call site.
//
// TODO(P1): suggestions sourced from
//   - community-looks interactions (users whose looks the caller ♡'d),
//   - phone-contact matches (when contactsMatch lands),
//   - mutual friends (n-degree friend-graph).

import type { Handler } from '../../context';
import type { SuggestedFriendsResponse } from '@mei/types';
import { requireAuthCtx } from '../../lib/handlerCtx';

export const suggestedHandler: Handler = async (ctx) => {
  // Auth-gate even though the body is a constant — keeps the public
  // surface uniform (every /friends route requires a user).
  requireAuthCtx(ctx);
  const body: SuggestedFriendsResponse = { items: [] };
  return { status: 200, body };
};
