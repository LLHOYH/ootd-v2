// Closet endpoints — see SPEC §7.2 (Closet, Combinations) and §9.1
// (closet upload pipeline).
//
// Route ordering: the tiny path router in services/api/src/router.ts
// matches first-registered-first, so STATIC paths must come before
// dynamic `:itemId` / `:comboId` routes for the same prefix. Specifically:
//
//   - `/closet/items/upload`         must come before `/closet/items/:itemId`
//   - `/closet/items/pending-review` must come before `/closet/items/:itemId`
//   - `/closet/combinations`         must come before `/closet/combinations/:comboId`
//
// Even though the segment counts differ in some of the cases above
// (`/closet/items/upload` is 3 segments, same as `/closet/items/:itemId`),
// the router compares segment-by-segment with first-match-wins — so
// listing the static path first guarantees it captures requests for
// the literal segment value before the `:itemId` route gets a look.
//
// Wrapping pattern matches stella/today: `requireAuth(attachSupabaseClient(h))`.
// The dispatcher in services/api/src/index.ts also re-wraps every route
// with `attachSupabaseClient` as a safety net; that wrapper is
// idempotent (`if (ctx.accessToken && !ctx.supabase)`), so registering
// both layers explicitly costs nothing.

import type { Handler } from '../../context';
import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';

import { confirmItemHandler } from './items/confirmItem';
import { deleteItemHandler } from './items/deleteItem';
import { getItemHandler } from './items/getItem';
import { listItemsHandler } from './items/listItems';
import { patchItemHandler } from './items/patchItem';
import { pendingReviewHandler } from './items/pendingReview';
import { processItemHandler } from './items/processItem';
import { uploadBatchHandler } from './items/uploadBatch';

import { createCombinationHandler } from './combinations/createCombination';
import { deleteCombinationHandler } from './combinations/deleteCombination';
import { getCombinationHandler } from './combinations/getCombination';
import { listCombinationsHandler } from './combinations/listCombinations';
import { patchCombinationHandler } from './combinations/patchCombination';

const wrap = (h: Handler): Handler => requireAuth(attachSupabaseClient(h));

export const closetRoutes: RouteDef[] = [
  // ------------------------------------------------------------------
  // Items — STATIC paths first to avoid `:itemId` shadowing.
  // ------------------------------------------------------------------
  {
    method: 'POST',
    path: '/closet/items/upload',
    handler: wrap(uploadBatchHandler),
  },
  {
    method: 'GET',
    path: '/closet/items/pending-review',
    handler: wrap(pendingReviewHandler),
  },

  // List + dynamic-id routes.
  {
    method: 'GET',
    path: '/closet/items',
    handler: wrap(listItemsHandler),
  },
  {
    method: 'POST',
    path: '/closet/items/:itemId/process',
    handler: wrap(processItemHandler),
  },
  {
    method: 'POST',
    path: '/closet/items/:itemId/confirm',
    handler: wrap(confirmItemHandler),
  },
  {
    method: 'GET',
    path: '/closet/items/:itemId',
    handler: wrap(getItemHandler),
  },
  {
    method: 'PATCH',
    path: '/closet/items/:itemId',
    handler: wrap(patchItemHandler),
  },
  {
    method: 'DELETE',
    path: '/closet/items/:itemId',
    handler: wrap(deleteItemHandler),
  },

  // ------------------------------------------------------------------
  // Combinations.
  // ------------------------------------------------------------------
  {
    method: 'GET',
    path: '/closet/combinations',
    handler: wrap(listCombinationsHandler),
  },
  {
    method: 'POST',
    path: '/closet/combinations',
    handler: wrap(createCombinationHandler),
  },
  {
    method: 'GET',
    path: '/closet/combinations/:comboId',
    handler: wrap(getCombinationHandler),
  },
  {
    method: 'PATCH',
    path: '/closet/combinations/:comboId',
    handler: wrap(patchCombinationHandler),
  },
  {
    method: 'DELETE',
    path: '/closet/combinations/:comboId',
    handler: wrap(deleteCombinationHandler),
  },
];
