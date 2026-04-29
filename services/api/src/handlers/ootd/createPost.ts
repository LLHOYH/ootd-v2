// POST /ootd — create an OOTD post.
//
// SPEC §7 (OOTD) + §9.3 (try-on photo + fallback OutfitCard) + §11.3
// (Wear-this / share flow) + §13.1 P0 ("ship the fallback OutfitCard").
//
// Flow:
//   1. Validate the body via `CreateOotdBody`. The schema's `superRefine`
//      already enforces "visibilityTargets required for GROUP|DIRECT,
//      empty otherwise" — we trust it.
//   2. Confirm the caller owns `comboId`. RLS already scopes the read
//      to the requester, so a missing row could be either "doesn't
//      exist" or "isn't theirs"; we collapse to a uniform 404 to avoid
//      leaking existence (same pattern used by stella/getConversation).
//   3. Insert the OOTD row. RLS (`ootd_posts_owner_insert`) also
//      enforces `auth.uid() = user_id`; we set it explicitly because
//      `user_id` is non-default.
//   4. Return `{ ootdId, status }`. The contract enum is
//      `'PROCESSING' | 'READY'` — the try-on photo is async (P1, §9.3)
//      and the fallback OutfitCard is composed by the image-worker out
//      of band, so we return `PROCESSING`. The mock-server returns
//      `READY` because it stamps a placeholder URL inline; that's a
//      mock convenience, not the production contract.

import type { Tables } from '@mei/types';
import { CreateOotdBody, type CreateOotdResponse } from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

export const createPostHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: CreateOotdBody }, ctx);

  // 1. Combo ownership check. `combinations` RLS scopes selects to the
  //    owner, so a non-owner combo simply doesn't appear here.
  const { data: combo, error: comboErr } = await supabase
    .from('combinations')
    .select('combo_id')
    .eq('combo_id', body.comboId)
    .eq('user_id', userId)
    .maybeSingle();
  if (comboErr) {
    throw new ApiError(500, 'INTERNAL', `Failed to load combination: ${comboErr.message}`);
  }
  if (!combo) {
    throw new ApiError(404, 'NOT_FOUND', 'Combination not found');
  }

  // 2. Insert the post. The schema defaults take care of `ootd_id`,
  //    `created_at`, and `visibility_targets` (`'{}'`); leaving
  //    `try_on_storage_key` and `fallback_outfit_card_storage_key` NULL
  //    so the image-worker can fill them in asynchronously.
  //
  //    TODO(image-worker): generate fallback OutfitCard composite into
  //    `ootd/{user_id}/{ootd_id}_card.webp` and patch the row with
  //    `fallback_outfit_card_storage_key` (§9.3 / §13.1 P0). Try-on
  //    photo generation is P1 per §9.3.
  const insertRow: {
    user_id: string;
    combo_id: string;
    visibility: Tables<'ootd_posts'>['visibility'];
    visibility_targets: string[];
    caption?: string | null;
    location_name?: string | null;
  } = {
    user_id: userId,
    combo_id: body.comboId,
    visibility: body.visibility,
    visibility_targets: body.visibilityTargets ?? [],
  };
  if (body.caption !== undefined) insertRow.caption = body.caption;
  if (body.locationName !== undefined) insertRow.location_name = body.locationName;

  const { data: inserted, error: insertErr } = await supabase
    .from('ootd_posts')
    .insert(insertRow)
    .select('ootd_id')
    .single();
  if (insertErr || !inserted) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to create OOTD: ${insertErr?.message ?? 'no row returned'}`,
    );
  }

  const responseBody: CreateOotdResponse = {
    ootdId: inserted.ootd_id,
    status: 'PROCESSING',
  };
  return { status: 201, body: responseBody };
};
