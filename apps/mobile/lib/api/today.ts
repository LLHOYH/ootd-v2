// Typed wrappers for the api Lambda's `/today` domain.
//
// Keeps the screen code free of URL strings and request shapes — and lets us
// swap implementations (e.g. an offline cache layer) behind the same export.

import type {
  AnotherPickBody,
  AnotherPickResponse,
  GetTodayResponse,
} from '@mei/types';

import { apiFetch } from './client';

/** GET /today — aggregate Today payload (SPEC §7.2 + §10.1). */
export function fetchToday(opts: { signal?: AbortSignal } = {}): Promise<GetTodayResponse> {
  return apiFetch<GetTodayResponse>('/today', { signal: opts.signal });
}

/** POST /today/another-pick — alternate combination for the user. */
export function postAnotherPick(
  body: AnotherPickBody,
  opts: { signal?: AbortSignal } = {},
): Promise<AnotherPickResponse> {
  return apiFetch<AnotherPickResponse>('/today/another-pick', {
    method: 'POST',
    body,
    signal: opts.signal,
  });
}
