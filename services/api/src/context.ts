// RequestContext — the mutable bag of per-request state that flows through
// router → middleware → handler. Built from the APIGW v2 event in index.ts.
//
// Keep this minimal: anything route-specific (validated body, userId after
// auth) is added by middleware.

import type { SupabaseClient } from '@supabase/supabase-js';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';

export interface RequestContext {
  method: HttpMethod;
  /** Path with the leading slash, e.g. `/closet/items`. No query, no stage. */
  path: string;
  /** Path params extracted by the router (e.g. `:itemId`). */
  params: Record<string, string>;
  /** Parsed query string, multi-value collapsed to last value. */
  query: Record<string, string>;
  /** Parsed JSON body, or `undefined` if no body / non-JSON. */
  body: unknown;
  /** Lower-cased header map. */
  headers: Record<string, string>;
  /** Supabase JWT `sub` claim — set by `requireAuth`. */
  userId?: string;
  /** Raw bearer token after `requireAuth`. Used by handlers that need a
   *  per-request RLS-scoped Supabase client (see `lib/supabase.ts`). */
  accessToken?: string;
  /** Per-request Supabase client minted from `accessToken`. Attached by the
   *  dispatcher in `index.ts` after `requireAuth` runs, so RLS evaluates
   *  `auth.uid()` against the caller's JWT. Undefined on unauthenticated
   *  routes (e.g. `/_health`). */
  supabase?: SupabaseClient;
  /** AWS region. */
  region: string;
}

/** Standard JSON response shape returned by handlers. */
export interface HandlerResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export type Handler = (ctx: RequestContext) => Promise<HandlerResponse>;
