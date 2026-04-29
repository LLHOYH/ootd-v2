// PATCH /closet/items/:itemId — partial update of a closet item.
//
// SPEC §7.2. The contract (`UpdateItemBody`) accepts a partial record
// of name / description / occasionTags / weatherTags / category. We map
// camelCase request fields to snake_case columns and let supabase-js
// build the UPDATE statement.
//
// `updated_at` is stamped manually here — there is no DB trigger for it
// in migration 0001. RLS already restricts updates to the owner; the
// `eq('user_id', userId)` is kept for clarity and so a missing row
// surfaces as 404 from `select('*').single()`.

import { z } from 'zod';

import {
  UpdateItemBody,
  type UpdateItemResponse,
} from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { validate } from '../../../middleware/validate';
import { mapClosetItem } from '../shared';

const Params = z.object({ itemId: z.string().uuid() });

export const patchItemHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params, body } = validate(
    { params: Params, body: UpdateItemBody },
    ctx,
  );
  const { itemId } = params;

  // Build a sparse update — only include keys the caller actually sent.
  // Skipping undefined fields keeps the SQL minimal and prevents a
  // missing field from clobbering its existing value with `null`.
  const update: {
    name?: string;
    description?: string;
    occasion_tags?: typeof body.occasionTags;
    weather_tags?: typeof body.weatherTags;
    category?: typeof body.category;
    updated_at?: string;
  } = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.occasionTags !== undefined) update.occasion_tags = body.occasionTags;
  if (body.weatherTags !== undefined) update.weather_tags = body.weatherTags;
  if (body.category !== undefined) update.category = body.category;

  const { data, error } = await supabase
    .from('closet_items')
    .update(update)
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to update closet item: ${error.message}`,
    );
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'Closet item not found');
  }

  const responseBody: UpdateItemResponse = await mapClosetItem(data);
  return { status: 200, body: responseBody };
};
