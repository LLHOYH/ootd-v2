// POST + DELETE /ootd/:ootdId/react — toggle the ♡ reaction.
//
// SPEC §7 (OOTD).
//
// Reactions table: `ootd_reactions` has primary key `(ootd_id, user_id)`,
// so an `upsert` with `onConflict: 'ootd_id,user_id', ignoreDuplicates:
// true` is naturally idempotent — the second tap of ♡ no-ops at the DB
// layer, no application-level pre-check.
//
// Visibility: the requester must be able to SELECT the parent OOTD to
// react. RLS handles this — `ootd_reactions_insert_self` requires both
// `auth.uid() = user_id` AND an EXISTS-check against `ootd_posts` that
// is itself filtered by `ootd_posts_visibility`. So an unauthorised
// reaction insert fails at RLS without us repeating the predicate here.
// We additionally do an explicit OOTD-visibility check up front so the
// failure mode is a clean 404 rather than the RLS surface.
//
// Both handlers return `{ ootdId, reactionCount }` per the
// `ReactOotdResponse` / `UnreactOotdResponse` contracts.

import { z } from 'zod';

import {
  ReactOotdBody,
  type ReactOotdResponse,
  type UnreactOotdResponse,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { fetchReactionCount } from './shared';

const Params = z.object({ ootdId: z.string().uuid() });

/**
 * Pre-check that the OOTD exists + is visible to the requester. RLS
 * would reject an unauthorised insert/delete anyway, but doing it here
 * means the response surface is a uniform 404 instead of an RLS error.
 */
async function assertOotdVisible(
  supabase: ReturnType<typeof requireAuthCtx>['supabase'],
  ootdId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('ootd_posts')
    .select('ootd_id')
    .eq('ootd_id', ootdId)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load OOTD: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', 'OOTD not found');
  }
}

// ---------------------------------------------------------------------------
// POST /ootd/:ootdId/react — add ♡ (idempotent).
// ---------------------------------------------------------------------------
export const reactHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params, body: ReactOotdBody }, ctx);
  const { ootdId } = params;

  await assertOotdVisible(supabase, ootdId);

  // Idempotent insert: PK is (ootd_id, user_id) so a duplicate just
  // no-ops at the DB layer thanks to `ignoreDuplicates: true`.
  // The `type` column has a default of '♡'; we set it explicitly so the
  // contract is obvious at the call site.
  const { error: upsertErr } = await supabase
    .from('ootd_reactions')
    .upsert(
      { ootd_id: ootdId, user_id: userId, type: '♡' },
      { onConflict: 'ootd_id,user_id', ignoreDuplicates: true },
    );
  if (upsertErr) {
    throw new ApiError(500, 'INTERNAL', `Failed to react: ${upsertErr.message}`);
  }

  const reactionCount = await fetchReactionCount(supabase, ootdId);
  const responseBody: ReactOotdResponse = { ootdId, reactionCount };
  return { status: 200, body: responseBody };
};

// ---------------------------------------------------------------------------
// DELETE /ootd/:ootdId/react — remove ♡.
// ---------------------------------------------------------------------------
export const unreactHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { ootdId } = params;

  await assertOotdVisible(supabase, ootdId);

  // Idempotent: deleting a non-existent reaction is a no-op (no rows
  // matched). We don't 404 on "you never reacted" — clients that
  // double-tap should see consistent success.
  const { error: deleteErr } = await supabase
    .from('ootd_reactions')
    .delete()
    .eq('ootd_id', ootdId)
    .eq('user_id', userId);
  if (deleteErr) {
    throw new ApiError(500, 'INTERNAL', `Failed to unreact: ${deleteErr.message}`);
  }

  const reactionCount = await fetchReactionCount(supabase, ootdId);
  const responseBody: UnreactOotdResponse = { ootdId, reactionCount };
  return { status: 200, body: responseBody };
};
