// Per-domain route registry.
//
// Each domain owns a directory under handlers/ that exports a typed
// RouteDef[]. This file just concatenates them. Wave 2c branches edit
// only their own domain's directory — never this file or services/api/src/index.ts.
// That keeps the six business-endpoint branches conflict-free.

import type { RouteDef } from '../router';

import { healthRoutes } from './_health';
import { closetRoutes } from './closet';
import { todayRoutes } from './today';
import { stellaRoutes } from './stella';
import { ootdRoutes } from './ootd';
import { friendsRoutes } from './friends';
import { chatRoutes } from './chat';

export const routes: RouteDef[] = [
  ...healthRoutes,
  ...closetRoutes,
  ...todayRoutes,
  ...stellaRoutes,
  ...ootdRoutes,
  ...friendsRoutes,
  ...chatRoutes,
];
