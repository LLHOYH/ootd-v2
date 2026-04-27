// RequestContext — the mutable bag of per-request state that flows through
// router → middleware → handler. Built from the APIGW v2 event in index.ts.
//
// Keep this minimal: anything route-specific (validated body, userId after
// auth) is added by middleware.

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
  /** Cognito `sub` claim — set by `requireAuth`. */
  userId?: string;
  /** Configured Cognito user pool id (from env). */
  userPoolId: string;
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
