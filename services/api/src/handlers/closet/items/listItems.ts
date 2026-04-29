// GET /closet/items — paginated list of the caller's closet.
//
// SPEC §7.2. Query: `?category=&status=&cursor=&limit=`.
// Uses the `closet_items_user_idx` (user_id, category, created_at desc)
// index from migration 0001 — order matches the index, so the optional
// category filter still hits it.
//
// Pagination follows the §7.1 opaque-base64 `{ offset }` convention so
// the frontend pages identically against the mock-server. We pull
// `limit + 1` rows and trim, which lets us emit `nextCursor` without a
// COUNT query.

import { ListItemsQuery, type ListItemsResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import {
  decodeCursor,
  encodeCursor,
  mapClosetItems,
} from '../shared';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listItemsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { query } = validate({ query: ListItemsQuery }, ctx);

  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { offset } = decodeCursor(query?.cursor);

  // Build the query, applying optional filters before .range() so the
  // server pages over the filtered set rather than the full closet.
  let q = supabase
    .from('closet_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // limit + 1 → +limit (inclusive bound)

  if (query?.category) q = q.eq('category', query.category);
  if (query?.status) q = q.eq('status', query.status);

  const { data, error } = await q;
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to list closet items: ${error.message}`,
    );
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapClosetItems(page);

  const responseBody: ListItemsResponse = { items };
  if (hasMore) {
    responseBody.nextCursor = encodeCursor({ offset: offset + page.length });
  }
  return { status: 200, body: responseBody };
};
