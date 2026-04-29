// GET /ootd/:ootdId — OOTD detail.
//
// SPEC §7 (OOTD) + §12.3 (visibility — `ootd_posts_visibility` is the
// authority). RLS hides rows the caller can't see, so a `maybeSingle`
// returning `null` collapses to a 404 — never leak existence of
// posts the caller can't read.

import { z } from 'zod';

import type { Tables } from '@mei/types';
import type { GetOotdResponse } from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import {
  fetchReactionSummaries,
  mapOotdPost,
  resolveOotdImageUrls,
} from './shared';

const Params = z.object({ ootdId: z.string().uuid() });

export const getPostHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { ootdId } = params;

  const { data, error } = await supabase
    .from('ootd_posts')
    .select('*')
    .eq('ootd_id', ootdId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load OOTD: ${error.message}`);
  }
  if (!data) {
    // Could be: doesn't exist, or RLS hid it. Same response either way.
    throw new ApiError(404, 'NOT_FOUND', 'OOTD not found');
  }

  const row = data as Tables<'ootd_posts'>;
  const reactionsByOotd = await fetchReactionSummaries(
    supabase,
    [row.ootd_id],
    userId,
  );
  const summary = reactionsByOotd.get(row.ootd_id) ?? {
    reactions: [],
    count: 0,
    meReacted: false,
  };
  const urls = await resolveOotdImageUrls(supabase, row);

  const responseBody: GetOotdResponse = mapOotdPost(row, summary, urls);
  return { status: 200, body: responseBody };
};
