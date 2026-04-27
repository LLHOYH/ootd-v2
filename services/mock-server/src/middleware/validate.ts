// Schema-driven validation helper. Wraps a route handler so that
// `body`, `query`, and `params` are validated against the supplied Zod
// schemas before the handler runs. On failure, replies 400 with the
// SPEC §7.1 error envelope.
//
// Response validation is performed by `validateResponse` — used by handlers
// that want to surface contract drift. On a response-side failure we log a
// warning and pass the body through anyway, so the dev loop is never blocked.

import type {
  FastifyRequest,
  RouteHandlerMethod,
} from 'fastify';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { sendError } from '../util/errors.js';

export interface RouteSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  /** Optional response schema — used by handlers via {@link validateResponse}. */
  response?: ZodTypeAny;
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Wraps a route handler with Zod validation for body/query/params.
 * Replaces in-place: validated values overwrite request.body/query/params.
 * On failure, replies with the SPEC §7.1 error envelope and returns.
 */
export function withSchema(
  schemas: RouteSchemas,
  handler: RouteHandlerMethod,
): RouteHandlerMethod {
  return async function wrapped(request, reply) {
    if (schemas.params) {
      const r = schemas.params.safeParse(request.params);
      if (!r.success) {
        sendError(reply, 400, 'VALIDATION_ERROR', `params: ${formatZodError(r.error)}`);
        return reply;
      }
      request.params = r.data;
    }
    if (schemas.query) {
      const r = schemas.query.safeParse(request.query);
      if (!r.success) {
        sendError(reply, 400, 'VALIDATION_ERROR', `query: ${formatZodError(r.error)}`);
        return reply;
      }
      request.query = r.data;
    }
    if (schemas.body) {
      const r = schemas.body.safeParse(request.body);
      if (!r.success) {
        sendError(reply, 400, 'VALIDATION_ERROR', `body: ${formatZodError(r.error)}`);
        return reply;
      }
      request.body = r.data;
    }
    return handler.call(this, request, reply);
  };
}

/**
 * Validate a response payload against its contract. On failure logs and
 * returns the original body — contract drift is visible without breaking
 * the dev loop.
 */
export function validateResponse<T>(
  request: FastifyRequest,
  schema: ZodTypeAny | undefined,
  body: T,
): T {
  if (!schema) return body;
  const result = schema.safeParse(body);
  if (!result.success) {
    request.log.warn(
      {
        reqId: request.id,
        url: request.url,
        issues: result.error.issues,
      },
      'response failed schema validation (contract drift?)',
    );
    return body;
  }
  return result.data as T;
}
