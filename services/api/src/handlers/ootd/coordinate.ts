// POST /ootd/:ootdId/coordinate — Stella suggests a coordinating outfit.
//
// SPEC §7 (OOTD) + §11.4 (Hangout coordination flow). P1 — for P0 we
// stub: validate that the OOTD exists + is visible to the requester
// (RLS), and return `202 Accepted` with a PENDING status so the
// frontend can render the "Stella is composing..." placeholder without
// fighting an unimplemented backend.
//
// TODO(stella-coordinate): forward to the Render stylist service to
// compute a coordinating outfit from the requester's closet (§11.4).
// Inputs the stylist needs: the friend's combo (already on the OOTD
// row), the requester's closet items, weather, and any hangout context.
// Output: a `Combination` plus rationale matching `CoordinateOotdResponse`.
//
// Note on the 202 response shape:
//   The contract `CoordinateOotdResponse` has the eventual READY shape
//   `{ suggestion, rationale? }`. For the PENDING stub we return a
//   different envelope (`{ status, message }`) under a 202 — clients
//   are expected to retry / poll a future endpoint. This deliberately
//   does not satisfy the eventual response Zod schema; doing so would
//   require a fake `Combination`, which we'd rather not invent. When
//   §11.4 lands, the contract will likely be widened to a discriminated
//   union and this handler swapped to a Render-service forward.

import { z } from 'zod';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const Params = z.object({ ootdId: z.string().uuid() });

interface CoordinatePendingBody {
  status: 'PENDING';
  message: string;
}

export const coordinateHandler: Handler = async (ctx) => {
  const { supabase } = requireAuthCtx(ctx);
  const { params } = validate({ params: Params }, ctx);
  const { ootdId } = params;

  // Visibility check — same surface as react/unreact: a uniform 404
  // when the OOTD doesn't exist or is hidden by RLS.
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

  // TODO(stella-coordinate): forward to the Render stylist service to
  // compute a coordinating outfit from the requester's closet (§11.4).
  const responseBody: CoordinatePendingBody = {
    status: 'PENDING',
    message: 'Stella is composing...',
  };
  return { status: 202, body: responseBody };
};
