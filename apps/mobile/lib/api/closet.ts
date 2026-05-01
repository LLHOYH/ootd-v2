// Typed wrappers for the api Lambda's `/closet` domain (SPEC §10.2).
//
// This PR only wires the read paths. Write paths (upload, confirm, patch,
// delete) ship with feat/wire-closet-edit once the upload pipeline (Wave
// 2d image-worker) lands.

import type {
  ListCombinationsResponse,
  ListItemsResponse,
  ClothingCategory,
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
