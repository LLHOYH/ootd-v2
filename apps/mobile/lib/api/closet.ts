// Typed wrappers for the api Lambda's `/closet` domain (SPEC §10.2 + §10.10).

import type {
  ClothingCategory,
  CreateCombinationBody,
  CreateCombinationResponse,
  ListCombinationsResponse,
  ListItemsResponse,
} from '@mei/types';
import { apiFetch } from './client';

/** GET /closet/items — paginated, optionally filtered by category. */
export function fetchClosetItems(
  opts: {
    signal?: AbortSignal;
    category?: ClothingCategory;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<ListItemsResponse> {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<ListItemsResponse>(`/closet/items${qs ? `?${qs}` : ''}`, {
    signal: opts.signal,
  });
}

/** GET /closet/combinations — paginated. */
export function fetchClosetCombinations(
  opts: { signal?: AbortSignal; cursor?: string; limit?: number } = {},
): Promise<ListCombinationsResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<ListCombinationsResponse>(
    `/closet/combinations${qs ? `?${qs}` : ''}`,
    { signal: opts.signal },
  );
}

/** POST /closet/combinations — assemble a combo from selected items. */
export function createCombination(
  body: CreateCombinationBody,
  opts: { signal?: AbortSignal } = {},
): Promise<CreateCombinationResponse> {
  return apiFetch<CreateCombinationResponse>('/closet/combinations', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}
