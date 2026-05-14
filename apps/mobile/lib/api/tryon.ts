// Typed wrappers for the api Lambda's `/tryon` domain (SPEC §10.10 PR C).

import type {
  CreateTryonBody,
  CreateTryonResponse,
  GetTryonResponse,
} from '@mei/types';
import { apiFetch } from './client';

/**
 * POST /tryon — create (or return cached) try-on generation.
 *
 * Synchronous in v1: this call blocks for ~15-30s while the worker calls
 * Replicate. Callers should show a long-running loading state.
 */
export function createTryon(
  body: CreateTryonBody,
  opts: { signal?: AbortSignal } = {},
): Promise<CreateTryonResponse> {
  return apiFetch<CreateTryonResponse>('/tryon', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}

/** GET /tryon/{id} — read a generation by id (cache + status polling). */
export function fetchTryon(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GetTryonResponse> {
  return apiFetch<GetTryonResponse>(`/tryon/${encodeURIComponent(id)}`, {
    signal: opts.signal,
  });
}
