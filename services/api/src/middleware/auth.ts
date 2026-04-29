// requireAuth — middleware that verifies a Supabase access token and attaches
// the user id (`sub` claim) to the request context.
//
// SPEC §7.1: `Authorization: Bearer <Supabase access token>` on every route
// except `/auth/*` and `/_health`.
//
// Supabase signs JWTs with HS256 against the project's JWT secret (config
// SUPABASE_JWT_SECRET). We verify locally with `jose` instead of going out
// to a JWKS endpoint — it's HMAC, not asymmetric, so there are no public
// keys to rotate. A future migration to RS256 would add `createRemoteJWKSet`
// here.

import { jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

import type { Handler, RequestContext } from '../context';
import { ApiError } from '../errors';
import { config } from '../lib/config';

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

// Memoise the encoded secret per warm container — TextEncoder().encode is
// cheap but called on the hot path for every request, no point repeating.
let _secretBytes: Uint8Array | undefined;
function secretBytes(): Uint8Array {
  if (!_secretBytes) {
    _secretBytes = new TextEncoder().encode(config.supabaseJwtSecret);
  }
  return _secretBytes;
}

export interface SupabaseTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  /** "authenticated" for signed-in users, "anon" for anon. */
  role?: string;
}

async function verifyToken(token: string): Promise<SupabaseTokenClaims> {
  // `audience: 'authenticated'` rejects anon tokens — only signed-in users
  // can call protected endpoints. `algorithms: ['HS256']` pins the algorithm
  // so an attacker can't downgrade to `none`.
  const { payload } = await jwtVerify(token, secretBytes(), {
    audience: 'authenticated',
    algorithms: ['HS256'],
  });
  return payload as SupabaseTokenClaims;
}

/**
 * Wrap a handler so it runs only for an authenticated caller.
 * On success, `ctx.userId` is the JWT `sub` and `ctx.accessToken` is the
 * raw token (for handlers that need an RLS-scoped Supabase client).
 */
export function requireAuth(handler: Handler): Handler {
  return async (ctx: RequestContext) => {
    const token = extractBearer(ctx.headers);
    let claims: SupabaseTokenClaims;
    try {
      claims = await verifyToken(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new ApiError(401, 'UNAUTHENTICATED', message);
    }
    if (!claims.sub) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Token missing sub claim');
    }
    return handler({ ...ctx, userId: claims.sub, accessToken: token });
  };
}

/** Test seam — drop the memoised secret bytes. */
export function __resetAuthForTests(): void {
  _secretBytes = undefined;
}
