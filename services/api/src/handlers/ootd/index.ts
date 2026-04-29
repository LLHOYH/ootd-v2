// OOTD endpoints — see SPEC §7 (OOTD).
//
// Handler composition: `requireAuth(attachSupabaseClient(handler))`.
//   - `requireAuth` verifies the Supabase JWT and sets `ctx.userId` +
//     `ctx.accessToken` (middleware/auth.ts).
//   - `attachSupabaseClient` mints a per-request RLS-scoped client off
//     the bearer token (services/api/src/index.ts).
// The dispatcher in services/api/src/index.ts ALSO re-wraps every route
// with `attachSupabaseClient` as a safety net; that wrapper is
// idempotent (`if (ctx.accessToken && !ctx.supabase)`), so registering
// the inner wrap explicitly here costs us nothing and matches the
// pattern the rest of the codebase uses verbatim (see today/index.ts
// and stella/index.ts).
//
// IMPORTANT: route registration order. The router (router.ts) matches
// in registration order, first-match-wins. `/ootd/feed` MUST be listed
// before `/ootd/:ootdId` or the dynamic param would shadow the static
// segment. Same logic applies to the `/react` and `/coordinate`
// sub-routes — they live under the `:ootdId` template, so order among
// them doesn't matter, but they must come AFTER the bare `:ootdId`
// only as far as duplication goes; method differences keep them
// disjoint.

import type { Handler } from '../../context';
import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';

import { coordinateHandler } from './coordinate';
import { createPostHandler } from './createPost';
import { deletePostHandler } from './deletePost';
import { feedHandler } from './feed';
import { getPostHandler } from './getPost';
import { reactHandler, unreactHandler } from './react';

const wrap = (h: Handler): Handler => requireAuth(attachSupabaseClient(h));

export const ootdRoutes: RouteDef[] = [
  // POST /ootd — create.
  { method: 'POST', path: '/ootd', handler: wrap(createPostHandler) },

  // Static segment before dynamic — `/ootd/feed` must beat `/ootd/:ootdId`.
  { method: 'GET', path: '/ootd/feed', handler: wrap(feedHandler) },

  // Detail + delete on `:ootdId`.
  { method: 'GET', path: '/ootd/:ootdId', handler: wrap(getPostHandler) },
  { method: 'DELETE', path: '/ootd/:ootdId', handler: wrap(deletePostHandler) },

  // Reactions — POST and DELETE share the path; method-routing keeps them
  // distinct.
  {
    method: 'POST',
    path: '/ootd/:ootdId/react',
    handler: wrap(reactHandler),
  },
  {
    method: 'DELETE',
    path: '/ootd/:ootdId/react',
    handler: wrap(unreactHandler),
  },

  // Coordinate — Stella suggestion stub for P0; P1 forwards to the Render
  // stylist service.
  {
    method: 'POST',
    path: '/ootd/:ootdId/coordinate',
    handler: wrap(coordinateHandler),
  },
];
