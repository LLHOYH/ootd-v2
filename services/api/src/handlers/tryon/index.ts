// Try-on endpoints — SPEC §10.10 (Wear-this), PR C of the selfie trilogy.
//
// POST /tryon          — create or return a cached try-on generation.
// GET  /tryon/{id}     — read a generation by id (cache check or polling).
//
// Same `requireAuth(attachSupabaseClient(handler))` composition as the
// rest of the api Lambda's domains.

import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';
import { createTryonHandler } from './createTryon';
import { getTryonHandler } from './getTryon';

export const tryonRoutes: RouteDef[] = [
  {
    method: 'POST',
    path: '/tryon',
    handler: requireAuth(attachSupabaseClient(createTryonHandler)),
  },
  {
    method: 'GET',
    path: '/tryon/:id',
    handler: requireAuth(attachSupabaseClient(getTryonHandler)),
  },
];
