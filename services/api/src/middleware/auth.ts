// requireAuth — middleware that verifies a Supabase access token and attaches
// the user id (`sub` claim) to the request context.
//
// SPEC §7.1: `Authorization: Bearer <Supabase access token>` on every route
// except `/auth/*` and `/_health`.
//
// Supabase access tokens are signed asymmetrically (ES256) by default for new
// projects and verified against the project's JWKS at
// `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. We keep an HS256 fallback
// for legacy projects where `SUPABASE_JWT_SECRET` is the symmetric key.

import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

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
function secretBytes(secret: string): Uint8Array {
  if (!_secretBytes) {
    _secretBytes = new TextEncoder().encode(secret);
  }
  return _secretBytes;
}

// Memoise the JWKS resolver too — `jose` caches the keys internally; this
// just keeps the resolver itself singleton across the warm container.
let _jwks: JWTVerifyGetKey | undefined;
function jwksResolver(): JWTVerifyGetKey {
  if (!_jwks) {
    const url = new URL(
      `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
    );
    _jwks = createRemoteJWKSet(url);
  }
  return _jwks;
}

export interface SupabaseTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  /** "authenticated" for signed-in users, "anon" for anon. */
  role?: string;
}

async function verifyToken(token: string): Promise<SupabaseTokenClaims> {
  // `audience: 'authenticated'` rejects anon tokens — only signed-in users
  // can call protected endpoints. Algorithms pin the legal set so an
  // attacker can't downgrade to `none`.
  try {
    // Primary path: asymmetric verification via the project's JWKS.
    const { payload } = await jwtVerify(token, jwksResolver(), {
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256', 'EdDSA'],
    });
    return payload as SupabaseTokenClaims;
  } catch (jwksErr) {
    // Fallback: legacy HS256. Only attempted if the project still exposes
    // a shared secret — older Supabase projects, or self-hosted GoTrue.
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw jwksErr;
    const { payload } = await jwtVerify(token, secretBytes(secret), {
      audience: 'authenticated',
      algorithms: ['HS256'],
    });
    return payload as SupabaseTokenClaims;
  }
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

/** Test seam — drop the memoised secret bytes + JWKS resolver. */
export function __resetAuthForTests(): void {
  _secretBytes = undefined;
  _jwks = undefined;
}
