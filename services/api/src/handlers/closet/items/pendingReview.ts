// GET /closet/items/pending-review — items awaiting user review.
//
// SPEC §7.2 + §10.3 (Closet AI Review modal). The spec's intent is
// "items in PROCESSING or freshly READY not yet user-confirmed". For
// P0 we return PROCESSING items only:
//
//   - The `closet_items` schema has no `confirmed_at` column.
//   - There is no client-side dismissal flag persisted server-side.
//   - Returning all READY items would re-surface every item the user
//     ever reviewed, every time the modal opens — worse UX than the
//     small gap we're accepting here.
//
// Once the row + UX exist, this handler can also pull READY items
// where `confirmed_at IS NULL`.
//
// TODO(spec): track a user-confirm timestamp on `closet_items` so this
// can include freshly-READY items per §10.3. Until then, `confirmItem`
// is a no-op stub and this endpoint returns only PROCESSING rows.

import type { PendingReviewResponse } from '@mei/types';

import type { Handler } from '../../../context';
import { ApiError } from '../../../errors';
import { requireAuthCtx } from '../../../lib/handlerCtx';
import { mapClosetItems } from '../shared';

export const pendingReviewHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  const { data, error } = await supabase
    .from('closet_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'PROCESSING')
    .order('created_at', { ascending: false });
  if (error) {
    throw new ApiError(
      500,
      'INTERNAL',
      `Failed to load pending-review items: ${error.message}`,
    );
  }

  const items = await mapClosetItems(data ?? []);
  const responseBody: PendingReviewResponse = { items };
  return { status: 200, body: responseBody };
};
