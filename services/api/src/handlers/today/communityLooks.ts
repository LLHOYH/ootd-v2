// GET /today/community-looks — paginated list of looks from the same age
// band + country as the requester. SPEC §7.2 + §10.1 + §12.6.
//
// Visibility rules (enforced both by RLS and explicit WHERE clauses):
//   - The OOTD post must be PUBLIC.
//   - The OOTD's owner must have `contributes_to_community_looks = true`.
//   - The owner must share the requester's `country_code`.
//
// The age-band filter described in §10.1 is intentionally NOT enforced as
// a hard SQL filter for P0: birth_year is optional, and aggressively
// filtering when cohort sizes are small would just hide the section
// entirely. We surface the age band per-row (§12.6) and let the cohort
// grow before we narrow further. TODO(community-looks-cohort): when we
// have enough opt-in users, add a `birth_year between :lo and :hi`
// predicate keyed on the requester's age band.

import type { Handler } from '../../context';
import { CommunityLooksQuery } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { config } from '../../lib/config';
import { validate } from '../../middleware/validate';
import {
  decodeCursor,
  encodeCursor,
  mapCommunityLook,
  type OotdWithOwner,
} from './shared';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Run the community-looks query and return the joined rows.
 *
 * Exported so `getToday.ts` can reuse the exact same query (capped at 5
 * rows for the §10.1 strip). Keeping the SQL in one place means the two
 * surfaces never drift.
 *
 * `requesterUserId` is passed explicitly rather than recomputed from
 * `supabase.auth.getUser()` because the bearer-token client already has
 * `auth.uid()` set; we just need the user's `country_code` to scope the
 * cohort.
 */
export async function fetchCommunityLooks(
  supabase: ReturnType<typeof requireAuthCtx>['supabase'],
  requesterUserId: string,
  opts: { offset: number; limit: number },
): Promise<OotdWithOwner[]> {
  // 1. Look up requester's country. RLS auto-filters to the caller's row.
  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('country_code')
    .eq('user_id', requesterUserId)
    .maybeSingle();
  if (meErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load user profile: ${meErr.message}`);
  }
  // No country on file → no cohort to compare against. Return empty list
  // rather than raising, so the §10.1 "hide section silently" empty state
  // works without special-casing on the client.
  if (!me || !me.country_code) return [];

  // 2. Pull PUBLIC OOTDs from opted-in same-country users. We use an
  //    inner join via the `users!inner(...)` shorthand so non-opted-in
  //    rows drop out before the LIMIT is applied.
  const { data, error } = await supabase
    .from('ootd_posts')
    .select(
      `ootd_id,
       user_id,
       try_on_storage_key,
       fallback_outfit_card_storage_key,
       created_at,
       users:users!inner (
         username,
         birth_year,
         country_code,
         contributes_to_community_looks
       )`,
    )
    .eq('visibility', 'PUBLIC')
    .eq('users.country_code', me.country_code)
    .eq('users.contributes_to_community_looks', true)
    .neq('user_id', requesterUserId)
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load community looks: ${error.message}`);
  }

  // Flatten: supabase-js returns the joined `users` row as a nested object
  // (or array, depending on relationship type). We inline the fields we
  // need and drop the nesting for cleaner downstream mapping.
  type Joined = {
    ootd_id: string;
    user_id: string;
    try_on_storage_key: string | null;
    fallback_outfit_card_storage_key: string | null;
    created_at: string;
    users:
      | {
          username: string;
          birth_year: number | null;
          country_code: string | null;
        }
      | {
          username: string;
          birth_year: number | null;
          country_code: string | null;
        }[]
      | null;
  };

  const rows = (data ?? []) as Joined[];
  return rows.flatMap((r): OotdWithOwner[] => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    if (!u) return [];
    return [
      {
        ootd_id: r.ootd_id,
        user_id: r.user_id,
        try_on_storage_key: r.try_on_storage_key,
        fallback_outfit_card_storage_key: r.fallback_outfit_card_storage_key,
        created_at: r.created_at,
        username: u.username,
        birth_year: u.birth_year,
        country_code: u.country_code,
      },
    ];
  });
}

export const communityLooksHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { query } = validate({ query: CommunityLooksQuery }, ctx);

  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { offset } = decodeCursor(query?.cursor);

  // Pull `limit + 1` so we can detect "has more" without a COUNT(*).
  const rows = await fetchCommunityLooks(supabase, userId, {
    offset,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map((r) => mapCommunityLook(r, config.supabaseUrl));
  const body: { items: typeof items; nextCursor?: string } = { items };
  if (hasMore) {
    body.nextCursor = encodeCursor({ offset: offset + page.length });
  }

  return { status: 200, body };
};
