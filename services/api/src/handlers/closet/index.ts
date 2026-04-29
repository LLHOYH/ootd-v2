// Closet endpoints — see SPEC §7 (Closet, Combinations).
//
// This file is the registry for the closet domain. Each Wave 2c branch
// (feat/closet-api) replaces this with real handlers. The structure stays
// the same:
//
//   import { listItemsHandler } from './listItems';
//   import { uploadHandler } from './upload';
//   ...
//   export const closetRoutes: RouteDef[] = [
//     { method: 'GET',  path: '/closet/items',          handler: requireAuth(attachSupabaseClient(listItemsHandler)) },
//     ...
//   ];
//
// Empty for now so the API still typechecks. Wave 2c fans out per-domain
// without touching ../index.ts.

import type { RouteDef } from '../../router';

export const closetRoutes: RouteDef[] = [];
