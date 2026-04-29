// _health domain — unauthenticated liveness probe. Stays untouched by every
// Wave 2c branch.
import type { RouteDef } from '../../router';
import { healthHandler } from './health';

export const healthRoutes: RouteDef[] = [
  { method: 'GET', path: '/_health', handler: healthHandler },
];
