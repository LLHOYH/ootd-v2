// Model photo endpoints.
//
// GET  /model-photo - latest model photo for the caller.
// POST /model-photo - generate a fresh model photo from selected/latest selfies.

import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';
import { createModelPhotoHandler } from './createModelPhoto';
import { getModelPhotoHandler } from './getModelPhoto';

export const modelPhotoRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/model-photo',
    handler: requireAuth(attachSupabaseClient(getModelPhotoHandler)),
  },
  {
    method: 'POST',
    path: '/model-photo',
    handler: requireAuth(attachSupabaseClient(createModelPhotoHandler)),
  },
];
