// Typed wrappers for the api Lambda's `/ootd` domain (SPEC §10.8).

import type {
  OotdFeedResponse,
  ReactOotdResponse,
  UnreactOotdResponse,
} from '@mei/types';
import { apiFetch } from './client';

/** GET /ootd/feed — visibility-filtered feed for the caller. */
export function fetchOotdFeed(
  opts: { signal?: AbortSignal; cursor?: string; limit?: number } = {},
): Promise<OotdFeedResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<OotdFeedResponse>(`/ootd/feed${qs ? `?${qs}` : ''}`, {
    signal: opts.signal,
  });
}

/** POST /ootd/:ootdId/react — add a ♡ reaction. */
export function reactOotd(
  ootdId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ReactOotdResponse> {
  return apiFetch<ReactOotdResponse>(`/ootd/${encodeURIComponent(ootdId)}/react`, {
    method: 'POST',
    body: { type: '♡' },
    signal: opts.signal,
  });
}

/** DELETE /ootd/:ootdId/react — remove caller's reaction. */
export function unreactOotd(
  ootdId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<UnreactOotdResponse> {
  return apiFetch<UnreactOotdResponse>(`/ootd/${encodeURIComponent(ootdId)}/react`, {
    method: 'DELETE',
    signal: opts.signal,
  });
}
