// Bearer-token verification for the stylist HTTP service.
//
// Same shape as `services/api/src/middleware/auth.ts` — Supabase signs
// access tokens with HS256 against the project's JWT secret. We verify
// locally via `jose` rather than going out to a JWKS endpoint (HMAC, no
// rotating public keys to fetch).
//
// `requireBearer(req, cfg)` returns `{ userId, jwt }` on success, or throws
// an `AuthError` (status 401) that the Fastify error handler translates
// into a `{ error: { code, message } }` body per SPEC §7.1.

import { jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
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
    const { payload } = await jwtVerify(token, secretBytes(cfg.supabaseJwtSecret), {
      audience: 'authenticated',
      algorithms: ['HS256'],
    });
    claims = payload as SupabaseTokenClaims;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    throw new AuthError('UNAUTHENTICATED', message);
  }
  if (!claims.sub) {
    throw new AuthError('UNAUTHENTICATED', 'Token missing sub claim');
  }
  return { userId: claims.sub, jwt: token };
}

/** Test seam — drop the memoised secret bytes. */
export function __resetAuthForTests(): void {
  _secretBytes = undefined;
}
