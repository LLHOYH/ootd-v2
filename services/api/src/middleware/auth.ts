// requireAuth — middleware that verifies a Cognito bearer token and attaches
// the user id (`sub`) to the request context.
//
// SPEC §7.1: `Authorization: Bearer <Cognito ID token>` on every route except
// `/auth/*` and `/health`.

import type { Handler, RequestContext } from '../context';
import { ApiError } from '../errors';
import { verifyIdToken } from '../lib/cognito';

const BEARER_PREFIX = 'bearer ';

function extractBearer(headers: Record<string, string>): string {
  const raw = headers['authorization'] ?? headers['Authorization'];
  if (!raw) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing Authorization header');
  }
  if (raw.toLowerCase().startsWith(BEARER_PREFIX)) {
    return raw.slice(BEARER_PREFIX.length).trim();
  }
  throw new ApiError(401, 'UNAUTHENTICATED', 'Authorization must be a Bearer token');
}

/**
 * Wrap a handler so it runs only for an authenticated caller.
 * On success, `ctx.userId` is set to the `sub` claim.
 */
export function requireAuth(handler: Handler): Handler {
  return async (ctx: RequestContext) => {
    const token = extractBearer(ctx.headers);
    let claims: { sub: string };
    try {
      claims = await verifyIdToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new ApiError(401, 'UNAUTHENTICATED', message);
    }
    if (!claims.sub) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Token missing sub claim');
    }
    return handler({ ...ctx, userId: claims.sub });
  };
}
