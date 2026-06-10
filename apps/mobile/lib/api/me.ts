// Typed wrappers for caller-scoped `/me` endpoints.

import type {
  UpsertCalendarEventsBody,
  UpsertCalendarEventsResponse,
  LikeCombinationResponse,
  MeLikesResponse,
  UpsertWeatherLocationBody,
  UpsertWeatherLocationResponse,
  UnlikeCombinationResponse,
} from '@mei/types';

import { apiFetch } from './client';

/** GET /me/likes — caller's liked/saved combination ids. */
export function fetchMeLikes(
  opts: { signal?: AbortSignal } = {},
): Promise<MeLikesResponse> {
  return apiFetch<MeLikesResponse>('/me/likes', { signal: opts.signal });
}

/** POST /me/likes — persist a liked/saved combination. */
export function likeCombination(
  comboId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<LikeCombinationResponse> {
  return apiFetch<LikeCombinationResponse>('/me/likes', {
    method: 'POST',
    body: { comboId },
    signal: opts.signal,
  });
}

/** DELETE /me/likes/:comboId — remove caller's liked/saved combination. */
export function unlikeCombination(
  comboId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<UnlikeCombinationResponse> {
  return apiFetch<UnlikeCombinationResponse>(
    `/me/likes/${encodeURIComponent(comboId)}`,
    {
      method: 'DELETE',
      signal: opts.signal,
    },
  );
}

/** PUT /me/weather-location — save rounded device location for Today weather. */
export function upsertWeatherLocation(
  body: UpsertWeatherLocationBody,
  opts: { signal?: AbortSignal } = {},
): Promise<UpsertWeatherLocationResponse> {
  return apiFetch<UpsertWeatherLocationResponse>('/me/weather-location', {
    method: 'PUT',
    body,
    signal: opts.signal,
  });
}

/** PUT /me/calendar-events — save today's owner-only calendar snapshot. */
export function upsertCalendarEvents(
  body: UpsertCalendarEventsBody,
  opts: { signal?: AbortSignal } = {},
): Promise<UpsertCalendarEventsResponse> {
  return apiFetch<UpsertCalendarEventsResponse>('/me/calendar-events', {
    method: 'PUT',
    body,
    signal: opts.signal,
  });
}
