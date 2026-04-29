// GET /ootd/feed — friend feed, cursor paginated.
//
// SPEC §7 (OOTD) + §12.3 (visibility rules — `ootd_posts_visibility`
// policy is the authority).
//
// Visibility is enforced entirely by the `ootd_posts_visibility` RLS
// policy (services/supabase/migrations/0002_rls_policies.sql §6):
//
//   - own posts
//   - PUBLIC|FRIENDS posts where `is_friend(auth.uid(), user_id)`
//   - GROUP posts where the requester is a member of one of the
//     hangouts in `visibility_targets`
//   - DIRECT posts where the requester appears in `visibility_targets`
//
// We therefore issue a plain `select * from ootd_posts order by
// created_at desc` against the user-scoped client and let RLS filter.
// Adding redundant predicates here would just duplicate the policy
// (and risk drifting from it).
//
// Cursor format: base64url-encoded `{ offset }`, matching mock-server +
// `today/community-looks` so the client pages identically (§7.1).
//
// We pull `limit + 1` to detect "has more" without a separate count.

import type { Tables } from '@mei/types';
import { OotdFeedQuery, type OotdFeedResponse, type OOTDPost } from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import {
  decodeCursor,
  encodeCursor,
  fetchReactionSummaries,
  mapOotdPost,
  resolveOotdImageUrls,
} from './shared';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const feedHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { query } = validate({ query: OotdFeedQuery }, ctx);

  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { offset } = decodeCursor(query?.cursor);

  // RLS = the visibility filter. We just paginate.
  const { data, error } = await supabase
    .from('ootd_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // inclusive; `limit + 1` rows so we can detect "has more"

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load OOTD feed: ${error.message}`);
  }

  const rows = (data ?? []) as Tables<'ootd_posts'>[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Reactions: one batched query keyed by the page's ootd_ids.
  const reactionsByOotd = await fetchReactionSummaries(
    supabase,
    page.map((r) => r.ootd_id),
    userId,
  );

  // Image URLs: each post has up to two signed URLs. We fan out per row
  // — Promise.all keeps total wall-time bounded by the slowest URL sign,
  // not the sum.
  const items: OOTDPost[] = await Promise.all(
    page.map(async (row) => {
      const urls = await resolveOotdImageUrls(supabase, row);
      const summary = reactionsByOotd.get(row.ootd_id) ?? {
        reactions: [],
        count: 0,
        meReacted: false,
      };
      return mapOotdPost(row, summary, urls);
    }),
  );

  const body: OotdFeedResponse = { items };
  if (hasMore) {
    body.nextCursor = encodeCursor({ offset: offset + page.length });
  }

  return { status: 200, body };
};
