// Cognito JWT verification using `aws-jwt-verify`.
//
// We verify two token kinds:
//   - access tokens (Cognito-issued, scope/`client_id` audience)
//   - id tokens    (Cognito-issued, `aud` = app client id)
//
// SPEC §7.1 says: `Authorization: Bearer <Cognito ID token>`. We default to
// id-token verification but expose access-token verification too for future
// machine-to-machine flows.
//
// Verifiers cache JWKS per warm container — they are deliberately memoised.

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from './config';

// We let TS infer the verifier types from CognitoJwtVerifier.create — the
// concrete generic shape is internal to aws-jwt-verify and not stable to spell
// out by hand.
let _id: ReturnType<typeof createIdVerifier> | undefined;
let _access: ReturnType<typeof createAccessVerifier> | undefined;

function createIdVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: config.cognitoUserPoolId,
    tokenUse: 'id',
    clientId: config.cognitoClientId,
  });
}

function createAccessVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: config.cognitoUserPoolId,
    tokenUse: 'access',
    clientId: config.cognitoClientId,
  });
}

function idVerifier() {
  if (!_id) _id = createIdVerifier();
  return _id;
}

function accessVerifier() {
  if (!_access) _access = createAccessVerifier();
  return _access;
}

/**
 * Verify a Cognito **id token** and return its claims. The `sub` claim is the
 * Cognito user id we use as `userId` throughout the app.
 */
export interface IdTokenClaims {
  sub: string;
  email?: string;
  'cognito:username'?: string;
  [k: string]: unknown;
}

export interface AccessTokenClaims {
  sub: string;
  username?: string;
  scope?: string;
  [k: string]: unknown;
}

export async function verifyIdToken(token: string): Promise<IdTokenClaims> {
  const claims = await idVerifier().verify(token);
  return claims as unknown as IdTokenClaims;
}

/** Verify a Cognito **access token** and return its claims. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const claims = await accessVerifier().verify(token);
  return claims as unknown as AccessTokenClaims;
}

/** Test seam. */
export function __resetCognitoForTests(): void {
  _id = undefined;
  _access = undefined;
}
