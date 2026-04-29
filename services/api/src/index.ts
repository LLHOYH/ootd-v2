// Lambda entrypoint — single handler behind API Gateway.
//
// Responsibilities:
//   1. Build a RequestContext from the APIGW v2 event.
//   2. Match it to a route via the router.
//   3. Run the handler and serialise the response.
//   4. Translate ApiError / ZodError / unknown errors into the SPEC §7.1
//      `{ error: { code, message } }` envelope.
//
// Adding routes: register them in `services/api/src/handlers/<domain>/index.ts`.
// That domain's `RouteDef[]` is then concatenated into the global registry by
// `services/api/src/handlers/index.ts`. This file does NOT need editing per
// new endpoint — Wave 2c branches each touch only their own domain directory,
// which keeps them conflict-free.
//
// Wrap business handlers as `requireAuth(attachSupabaseClient(handler))` so
// that — by the time they run — both `ctx.userId` and `ctx.supabase` are set.
// `_health` is in the public allowlist (SPEC §7.1).

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from 'aws-lambda';
import { ZodError } from 'zod';

import { defineRouter } from './router';
import { ApiError, internalErrorBody } from './errors';
import type { Handler, HttpMethod, RequestContext } from './context';
import { routes } from './handlers';
import { getSupabaseFor } from './lib/supabase';

// ---------------------------------------------------------------------------
// Per-request Supabase client attachment.
//
// `requireAuth` (middleware/auth.ts) verifies the JWT and copies the bearer
// token onto `ctx.accessToken`. Once that's set, every authenticated business
// handler wants a Supabase client whose RLS evaluates `auth.uid()` against
// the caller's JWT — i.e. `getSupabaseFor(ctx.accessToken)`.
//
// Rather than make every handler remember to mint that client, the
// dispatcher wraps each registered handler with `attachSupabaseClient`. The
// wrapper composes INSIDE `requireAuth` (`requireAuth(attachSupabaseClient(h))`)
// so it sees the post-auth ctx with `accessToken` populated, mints the
// client, and forwards. For unauthenticated routes (no `accessToken`),
// it's a transparent no-op and `ctx.supabase` stays `undefined`.
// ---------------------------------------------------------------------------
export function attachSupabaseClient(inner: Handler): Handler {
  return async (ctx: RequestContext) => {
    if (ctx.accessToken && !ctx.supabase) {
      ctx.supabase = getSupabaseFor(ctx.accessToken);
    }
    return inner(ctx);
  };
}

// ---------------------------------------------------------------------------
// Route registry.
//
// `routes` is the concatenation of every domain's RouteDef[] (see
// handlers/index.ts). The dispatcher wraps every registered handler with
// `attachSupabaseClient` as a safety net, so any flow that has set
// `ctx.accessToken` (i.e. anything past `requireAuth`) gets `ctx.supabase`
// populated automatically. Public routes — currently just `_health` — see
// no token, so the wrapper is a transparent no-op for them.
// ---------------------------------------------------------------------------
const router = defineRouter(
  routes.map((r) => ({ ...r, handler: attachSupabaseClient(r.handler) })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lowerHeaders(
  h: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v;
  }
  return out;
}

function parseBody(
  raw: string | undefined,
  isBase64: boolean,
  contentType: string | undefined,
): unknown {
  if (!raw) return undefined;
  const text = isBase64 ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  if (contentType && contentType.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'Body is not valid JSON');
    }
  }
  return text;
}

function buildContext(
  event: APIGatewayProxyEventV2,
  region: string,
): RequestContext {
  const method = event.requestContext.http.method.toUpperCase() as HttpMethod;
  const rawPath = event.rawPath || '/';
  // Strip the API Gateway stage prefix if present (e.g. `/v1/...`).
  const path = rawPath.startsWith('//') ? rawPath.slice(1) : rawPath;
  const headers = lowerHeaders(event.headers);
  const body = parseBody(
    event.body ?? undefined,
    event.isBase64Encoded ?? false,
    headers['content-type'],
  );
  const query: Record<string, string> = {};
  if (event.queryStringParameters) {
    for (const [k, v] of Object.entries(event.queryStringParameters)) {
      if (typeof v === 'string') query[k] = v;
    }
  }
  return {
    method,
    path,
    params: {},
    query,
    body,
    headers,
    region,
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function errorResponse(err: unknown): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ApiError) {
    return jsonResponse(err.status, err.toErrorBody());
  }
  if (err instanceof ZodError) {
    // Defensive — handlers should already be wrapping with validate().
    const msg = err.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return jsonResponse(400, { error: { code: 'VALIDATION', message: msg } });
  }
  // Unknown — log server-side, but never leak internals to the client.
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error', err);
  return jsonResponse(500, internalErrorBody());
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2,
  _ctx: LambdaContext,
): Promise<APIGatewayProxyStructuredResultV2> => {
  // Resolve env at request time, not module load — keeps cold-start error
  // surface focused on routes that actually need each var.
  const region = process.env.REGION ?? process.env.AWS_REGION ?? 'us-east-1';

  try {
    const ctx = buildContext(event, region);
    const matched = router.match(ctx.method, ctx.path);
    if (!matched) {
      return errorResponse(
        new ApiError(404, 'NOT_FOUND', `No route for ${ctx.method} ${ctx.path}`),
      );
    }
    ctx.params = matched.params;
    const res = await matched.handler(ctx);
    return jsonResponse(res.status, res.body, res.headers ?? {});
  } catch (err) {
    return errorResponse(err);
  }
};
