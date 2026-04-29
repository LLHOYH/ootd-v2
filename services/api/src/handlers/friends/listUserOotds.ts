// GET /users/:userId/ootds — public OOTDs for the given user.
//
// SPEC §7.2 (Public profile) + §10.15. Visibility is enforced entirely
// by the `ootd_posts_visibility` RLS policy — the caller sees a row iff:
//   - they own it, OR
//   - visibility ∈ (PUBLIC, FRIENDS) and they are a friend, OR
//   - visibility = GROUP and they share a hangout, OR
//   - visibility = DIRECT and they are in `visibility_targets`.
//
// We do NOT pre-check the public-profile 404 condition here. The
// rationale: if the caller can't see the profile (per
// `users_select_visible`), they can still potentially see PUBLIC OOTDs
// the user authored — the RLS policies are independent. So this
// endpoint mirrors the "list OOTDs visible to me, scoped to one author"
// shape; the screen typically opens after a successful /users/:userId
// hit so the 404 surface is already done up the call stack.

import { z } from 'zod';
import type { Handler } from '../../context';
import type { ListUserOotdsResponse, OOTDPost } from '@mei/types';
import { ListUserOotdsQuery } from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { config } from '../../lib/config';
import { validate } from '../../middleware/validate';
import {
  decodeCursor,
  encodeCursor,
  mapOotdPost,
  type OotdPostRowWithReactions,
} from './shared';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const Params = z.object({ userId: z.string().uuid() });

export const listUserOotdsHandler: Handler = async (ctx) => {
  const { supabase } = requireAuthCtx(ctx);
  const { params, query } = validate(
    { params: Params, query: ListUserOotdsQuery },
    ctx,
  );
  const { userId } = params;

  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { offset } = decodeCursor(query?.cursor);

  // Pull `limit + 1` to detect "has more" without a COUNT(*).
  const { data, error } = await supabase
    .from('ootd_posts')
    .select(
      `ootd_id,
       user_id,
       combo_id,
       caption,
       location_name,
       try_on_storage_key,
       fallback_outfit_card_storage_key,
       visibility,
       visibility_targets,
       created_at,
       ootd_reactions ( user_id, type )`,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load OOTDs: ${error.message}`);
  }
  const rows = (data ?? []) as OotdPostRowWithReactions[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: OOTDPost[] = page.map((r) => mapOotdPost(r, config.supabaseUrl));
  const body: ListUserOotdsResponse = { items };
  if (hasMore) {
    body.nextCursor = encodeCursor({ offset: offset + page.length });
  }
  return { status: 200, body };
};
