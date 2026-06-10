// /me/likes — persist the caller's saved-look heart state.
//
// The Today card only needs "which combinations have I liked?" plus
// idempotent add/remove. RLS keeps the table caller-scoped; the explicit
// owner check gives a cleaner 404 if a caller tries to like a combo they
// cannot own in this P0 surface.

import { z } from 'zod';

import {
  LikeCombinationBody,
  type LikeCombinationResponse,
  type MeLikesResponse,
  type UnlikeCombinationResponse,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ comboId: z.string().uuid() });

async function assertOwnCombination(
  supabase: ReturnType<typeof requireAuthCtx>['supabase'],
  userId: string,
  comboId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('combinations')
    .select('combo_id')
    .eq('combo_id', comboId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load combination: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
  }
}

export const listLikesHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  const { data, error } = await supabase
    .from('combination_likes')
    .select('combo_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load likes: ${error.message}`);
  }

  const body: MeLikesResponse = {
    comboIds: (data ?? []).map((row) => row.combo_id),
  };
  return { status: 200, body };
};

export const likeCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: LikeCombinationBody }, ctx);
  const { comboId } = body;

  await assertOwnCombination(supabase, userId, comboId);

  const { error } = await supabase
    .from('combination_likes')
    .upsert(
      { user_id: userId, combo_id: comboId },
      { onConflict: 'user_id,combo_id', ignoreDuplicates: true },
    );

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to like combination: ${error.message}`);
  }

  const responseBody: LikeCombinationResponse = { comboId, liked: true };
  return { status: 200, body: responseBody };
};

export const unlikeCombinationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { comboId } = params;

  const { error } = await supabase
    .from('combination_likes')
    .delete()
    .eq('user_id', userId)
    .eq('combo_id', comboId);

  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to unlike combination: ${error.message}`);
  }

  const responseBody: UnlikeCombinationResponse = { comboId, liked: false };
  return { status: 200, body: responseBody };
};
