// Dev-only auth. Real API uses Cognito (SPEC §7.1) — this is a mock.
// Convention: `Authorization: Bearer mock_<userId>`.
// The suffix becomes `request.userId`.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

const PUBLIC_PREFIXES = ['/health', '/auth/'];

function isPublic(url: string): boolean {
  // strip query string
  const path = url.split('?')[0] ?? url;
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  );
}

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isPublic(request.url)) return;

  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Missing bearer token');
    return reply;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token.startsWith('mock_')) {
    sendError(
      reply,
      401,
      'UNAUTHORIZED',
      'Dev tokens must look like `mock_<userId>`',
    );
    return reply;
  }
  const userId = token.slice('mock_'.length);
  if (userId.length === 0) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Empty user id in token');
    return reply;
  }
  request.userId = userId;
}

/** Helper for handlers — throws 401 if no userId on request. */
export function requireUserId(request: FastifyRequest): string {
  if (!request.userId) {
    // Should never happen if authPreHandler ran, but belt-and-suspenders.
    throw Object.assign(new Error('Unauthenticated'), {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }
  return request.userId;
}
