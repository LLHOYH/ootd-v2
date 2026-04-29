// GET /closet/combinations — paginated list of the caller's combinations.
//
// SPEC §7.2. Each combination response includes its `itemIds[]`, so we
// pull `combination_items` in the same query via supabase-js's nested
// select. Items are ordered by `position` inside the mapper.
//
// Pagination follows §7.1's opaque-base64 `{ offset }` convention,
// matching the rest of the API.

import {
  ListCombinationsQuery,
  type ListCombinationsResponse,
  type Tables,
} from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import {
  decodeCursor,
  encodeCursor,
  mapCombination,
  type CombinationWithItems,
} from '../shared';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type ComboRow = Tables<'combinations'> & {
  combination_items: { item_id: string; position: number }[] | null;
};

export const listCombinationsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { query } = validate({ query: ListCombinationsQuery }, ctx);

  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { offset } = decodeCursor(query?.cursor);

  const { data, error } = await supabase
    .from('combinations')
    .select(
      `combo_id,
       user_id,
       name,
       occasion_tags,
       source,
       created_at,
       combination_items (
         item_id,
         position
       )`,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // limit + 1 → offset + limit (inclusive)
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to list combinations: ${error.message}`,
    );
  }

  const rows = (data ?? []) as unknown as ComboRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map((r) => {
    const withItems: CombinationWithItems = {
      row: {
        combo_id: r.combo_id,
        user_id: r.user_id,
        name: r.name,
        occasion_tags: r.occasion_tags,
        source: r.source,
        created_at: r.created_at,
      },
      items: r.combination_items ?? [],
    };
    return mapCombination(withItems);
  });

  const responseBody: ListCombinationsResponse = { items };
  if (hasMore) {
    responseBody.nextCursor = encodeCursor({ offset: offset + page.length });
  }
  return { status: 200, body: responseBody };
};
