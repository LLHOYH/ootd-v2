// Mei API client — thin `fetch` wrapper around the api Lambda's HTTP surface.
//
// The Lambda is reachable in three ways during the lifetime of the project:
//   1. Local dev: `pnpm --filter @mei/api serve` on http://127.0.0.1:3001.
//   2. Deployed dev/staging: API Gateway URL.
//   3. Production: behind the prod API Gateway URL.
//
// The base URL comes from `EXPO_PUBLIC_API_URL` (set in apps/mobile/.env);
// the bearer JWT comes from the active Supabase session, fetched lazily so
// every call sees the freshest access token (Supabase auto-refreshes).
//
// This module deliberately stays thin — typed wrappers per endpoint live in
// neighbouring files (e.g. ./today.ts). All failure modes funnel into
// `ApiError` so callers can `try/catch` once.

import { supabase } from '../supabase';

const DEFAULT_API_URL = 'http://127.0.0.1:3001';
const DEFAULT_STYLIST_URL = 'http://127.0.0.1:8080';

/** Resolves the api base URL from env, with a localhost fallback for dev. */
export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url && url.length > 0 ? url.replace(/\/$/, '') : DEFAULT_API_URL;
}

/**
 * Resolves the stylist (Stella SSE) base URL from env, with a localhost
 * fallback. The stylist runs on Render in production, so this is a
 * different host than the api Lambda.
 */
export function getStylistBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_STYLIST_URL;
  return url && url.length > 0 ? url.replace(/\/$/, '') : DEFAULT_STYLIST_URL;
}

/**
 * Error thrown by `apiFetch` for any non-2xx response, network failure, or
 * malformed JSON. The `code` mirrors the SPEC §7.1 envelope where available;
 * `status` is the HTTP status (0 for transport errors).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body?: unknown;
  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /**
   * Override the bearer token. By default, pulls from the active Supabase
   * session. Pass `null` to skip auth entirely (e.g. /_health).
   */
  authToken?: string | null;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Extra headers merged on top of the defaults. */
  headers?: Record<string, string>;
}

async function resolveBearerToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // Surfacing this as ApiError lets the caller render the same error UI it
    // would for a 401 from the api itself.
    throw new ApiError(401, 'UNAUTHENTICATED', error.message);
  }
  return data.session?.access_token ?? null;
}

/**
 * Generic typed call to the api Lambda.
 *   const today = await apiFetch<GetTodayResponse>('/today');
 *
 * The path is appended to `getApiBaseUrl()`; pass an absolute URL to override.
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    accept: 'application/json',
    ...opts.headers,
  };

  // Attach bearer token unless the caller opted out.
  if (opts.authToken !== null) {
    const token = opts.authToken ?? (await resolveBearerToken());
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let bodyInit: BodyInit | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    headers['content-type'] = 'application/json';
    bodyInit = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: bodyInit,
      signal: opts.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(0, 'NETWORK_ERROR', msg);
  }

  // Try to parse JSON regardless of status — error responses are JSON too.
  let parsed: unknown;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'BAD_RESPONSE', 'Response body was not JSON', text);
    }
  }

  if (!res.ok) {
    const env = parsed as { error?: { code?: string; message?: string } } | undefined;
    const code = env?.error?.code ?? `HTTP_${res.status}`;
    const message = env?.error?.message ?? res.statusText;
    throw new ApiError(res.status, code, message, parsed);
  }

  return parsed as T;
}
