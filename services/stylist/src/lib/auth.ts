// Bearer-token verification for the stylist HTTP service.
//
// Supabase access tokens are now signed asymmetrically (ES256) by default
// for new projects and verified against the project's JWKS at
// `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Older projects still
// using HS256 keep working: if `SUPABASE_JWT_SECRET` is set we attempt the
// HMAC path as a fallback when JWKS verification rejects the algorithm.
//
// `requireBearer(req, cfg)` returns `{ userId, jwt }` on success, or throws
// an `AuthError` (status 401) that the Fastify error handler translates
// into a `{ error: { code, message } }` body per SPEC §7.1.

import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import type { FastifyRequest } from 'fastify';
import type { StylistConfig } from '../config';

const BEARER_PREFIX = 'bearer ';

export class AuthError extends Error {
  readonly statusCode = 401;
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}

interface SupabaseTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
}

// Memoise the encoded secret — TextEncoder().encode is cheap, but we hit
// this on every request on the hot path.
let _secretBytes: Uint8Array | undefined;
function secretBytes(secret: string): Uint8Array {
  if (!_secretBytes) {
    _secretBytes = new TextEncoder().encode(secret);
  }
  return _secretBytes;
}

// Memoise the JWKS resolver — `jose` caches keys internally, but we still
// want a single resolver per process to share the cache.
let _jwks: JWTVerifyGetKey | undefined;
function jwksFor(supabaseUrl: string): JWTVerifyGetKey {
  if (!_jwks) {
    const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
    _jwks = createRemoteJWKSet(url);
  }
  return _jwks;
}

function extractBearer(req: FastifyRequest): string {
  const headers = req.headers;
  const raw =
    (headers['authorization'] as string | undefined) ??
    (headers['Authorization'] as unknown as string | undefined);
  if (!raw) {
    throw new AuthError('UNAUTHENTICATED', 'Missing Authorization header');
  }
  if (raw.toLowerCase().startsWith(BEARER_PREFIX)) {
    return raw.slice(BEARER_PREFIX.length).trim();
  }
  throw new AuthError(
    'UNAUTHENTICATED',
    'Authorization must be a Bearer token',
  );
}

export interface BearerIdentity {
  userId: string;
  jwt: string;
}

export async function requireBearer(
  req: FastifyRequest,
  cfg: StylistConfig,
): Promise<BearerIdentity> {
  const token = extractBearer(req);
  let claims: SupabaseTokenClaims;
  try {
    // Primary: asymmetric verification via the project JWKS. Newer Supabase
    // projects (kid-based ES256) all land here.
    const { payload } = await jwtVerify(token, jwksFor(cfg.supabaseUrl), {
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256', 'EdDSA'],
    });
    claims = payload as SupabaseTokenClaims;
  } catch (jwksErr) {
    // Fallback: legacy HS256 — only attempted when a JWT secret is configured.
    if (cfg.supabaseJwtSecret && cfg.supabaseJwtSecret.length > 0) {
      try {
        const { payload } = await jwtVerify(token, secretBytes(cfg.supabaseJwtSecret), {
          audience: 'authenticated',
          algorithms: ['HS256'],
        });
        claims = payload as SupabaseTokenClaims;
      } catch (hsErr) {
        const message = hsErr instanceof Error ? hsErr.message : 'Invalid token';
        throw new AuthError('UNAUTHENTICATED', message);
      }
    } else {
      const message = jwksErr instanceof Error ? jwksErr.message : 'Invalid token';
      throw new AuthError('UNAUTHENTICATED', message);
    }
  }
  if (!claims.sub) {
    throw new AuthError('UNAUTHENTICATED', 'Token missing sub claim');
  }
  return { userId: claims.sub, jwt: token };
}

/** Test seam — drop the memoised secret bytes + JWKS resolver. */
export function __resetAuthForTests(): void {
  _secretBytes = undefined;
  _jwks = undefined;
}
