// Standard error envelope per SPEC.md §7.1.

import type { FastifyReply } from 'fastify';
import type { ErrorBody } from '@mei/types';

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(statusCode).send(errorBody(code, message));
}

export function notFound(message = 'Not found'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function badRequest(message: string, code = 'BAD_REQUEST'): ApiError {
  return new ApiError(400, code, message);
}

export function forbidden(message = 'Forbidden'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function unauthorized(message = 'Unauthorized'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}
