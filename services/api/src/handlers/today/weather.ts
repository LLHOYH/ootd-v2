// Weather provider — STUB.
//
// The real integration (OpenWeatherMap or similar) plugs in here. For now
// we mirror the mock-server's behaviour: a city read from the user's
// profile, a temperature that wobbles ±2 each call so the UI doesn't look
// frozen, and a derived `weatherTag`.
//
// TODO(weather-provider): swap this for a cached call to OpenWeatherMap
// keyed on (lat, lon, hour). Cache for ~30 minutes to stay inside the
// free-tier rate limit. Until that's wired, do NOT make network calls
// from this file — the API is meant to typecheck and run with no external
// secrets configured beyond Supabase.

import type { WeatherSnapshot, WeatherTag } from '@mei/types';

const DEFAULT_CITY = 'Singapore';

/** Map a temperature in °C to a §6.2 WeatherTag. */
function tagForTempC(tempC: number): WeatherTag {
  if (tempC >= 28) return 'HOT';
  if (tempC >= 22) return 'WARM';
  if (tempC >= 12) return 'MILD';
  return 'COLD';
}

export function buildWeatherSnapshot(opts: {
  city: string | null | undefined;
  /** Provided in tests so the wobble is deterministic; otherwise random. */
  rng?: () => number;
}): WeatherSnapshot {
  const rng = opts.rng ?? Math.random;
  // Anchor: 26°C (Singapore-ish baseline). Real provider will replace this.
  const tempC = 26 + Math.round(rng() * 4);
  const weatherTag = tagForTempC(tempC);
  const condition = tempC >= 28 ? 'Sunny' : 'Cloudy';
  return {
    tempC,
    condition,
    city: opts.city ?? DEFAULT_CITY,
    weatherTag,
  };
}
