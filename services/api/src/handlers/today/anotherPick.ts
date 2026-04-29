// POST /today/another-pick — Stella picks an alternative outfit.
//
// SPEC §7.2 / §8.5. The real flow is a one-shot Stella call that respects
// today's weather + calendar. For P0 this picks a random combination
// (optionally filtered by occasion + excludeComboIds) from the user's
// own combinations table — RLS already scopes the query to `auth.uid()`.
//
// TODO(stella-today-pick): replace the random draw with a one-shot
// stylist call (§8.5). Inputs: weather + calendar + closet + style
// prefs + the same exclude/occasion filters; output: comboId. Wire that
// into the `/stella` service once feat/stella-api lands.

import type { Handler } from '../../context';
import {
  AnotherPickBody,
  type AnotherPickResponse,
  type Tables,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';
import { mapCombination, type CombinationWithItems } from './shared';

export const anotherPickHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: AnotherPickBody }, ctx);

  // `AnotherPickBody` is `.optional()` at the contract level, so an empty
  // body is fine. Normalise to a concrete object so the rest of the
  // function never has to repeat `body?.`.
  const filters = body ?? {};
  const excludes = new Set(filters.excludeComboIds ?? []);

  // 1. Pull every combination the caller owns. RLS does the user-scoping;
  //    we don't need a `.eq('user_id', userId)` clause but include it
  //    anyway as defence-in-depth + so the query plan uses the
  //    `combinations_user_created_idx` index.
  let query = supabase
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
    .order('created_at', { ascending: false });

  // Postgres array-contains: when an occasion is specified, only return
  // combos tagged with it. We do this in SQL rather than in JS so a user
  // with thousands of combinations doesn't pay the round-trip.
  if (filters.occasion) {
    query = query.contains('occasion_tags', [filters.occasion]);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load combinations: ${error.message}`);
  }

  // The select pulls every column on `combinations` plus the `combination_items`
  // relationship, so the row shape is the DB row + a nested array.
  type Row = Tables<'combinations'> & {
    combination_items: { item_id: string; position: number }[] | null;
  };

  const rows = ((data ?? []) as Row[]).filter((r) => !excludes.has(r.combo_id));
  if (rows.length === 0) {
    throw new ApiError(404, 'NO_PICK', 'No combinations available to pick from');
  }

  // Random draw. `Math.random` is fine here — there's no security
  // boundary, and the user is going to ask "Try another" until they're
  // happy anyway.
  const idx = Math.floor(Math.random() * rows.length);
  const chosen = rows[idx]!;

  const withItems: CombinationWithItems = {
    row: {
      combo_id: chosen.combo_id,
      user_id: chosen.user_id,
      name: chosen.name,
      occasion_tags: chosen.occasion_tags,
      source: chosen.source,
      created_at: chosen.created_at,
    },
    items: chosen.combination_items ?? [],
  };

  const responseBody: AnotherPickResponse = {
    pick: mapCombination(withItems),
  };
  return { status: 200, body: responseBody };
};
