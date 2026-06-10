// Weather provider.
//
// With OPENWEATHER_API_KEY + device coords, GET /today returns real current
// weather. Without either, we keep the original no-secret stub so local dev
// and CI still boot with only Supabase configured.

import type { WeatherSnapshot, WeatherTag } from '@mei/types';
import { z } from 'zod';

import { config } from '../../lib/config';

const DEFAULT_CITY = 'Singapore';
const OPENWEATHER_CACHE_MS = 30 * 60 * 1000;
const OPENWEATHER_TIMEOUT_MS = 3500;

const OpenWeatherResponse = z.object({
  name: z.string().optional(),
  main: z.object({
    temp: z.number(),
  }),
  weather: z
    .array(
      z.object({
        main: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

const weatherCache = new Map<string, { expiresAt: number; snapshot: WeatherSnapshot }>();

/** Map a temperature in °C to a §6.2 WeatherTag. */
function tagForTempC(tempC: number): WeatherTag {
  if (tempC >= 28) return 'HOT';
  if (tempC >= 22) return 'WARM';
  if (tempC >= 12) return 'MILD';
  return 'COLD';
}

function tagForProviderWeather(main: string | undefined, tempC: number): WeatherTag {
  const normalized = main?.toLowerCase() ?? '';
  if (
    normalized.includes('rain') ||
    normalized.includes('drizzle') ||
    normalized.includes('thunderstorm')
  ) {
    return 'RAIN';
  }
  return tagForTempC(tempC);
}

function conditionLabel(main: string | undefined, description: string | undefined): string {
  const raw = main ?? description ?? 'Cloudy';
  if (raw.toLowerCase() === 'clouds') return 'Cloudy';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function fallbackWeatherSnapshot(opts: {
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

async function fetchOpenWeatherSnapshot(opts: {
  latitude: number;
  longitude: number;
  fallbackCity: string | null | undefined;
}): Promise<WeatherSnapshot | null> {
  const apiKey = config.openWeatherApiKey;
  if (!apiKey) return null;

  const key = cacheKey(opts.latitude, opts.longitude);
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;

  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(opts.latitude));
  url.searchParams.set('lon', String(opts.longitude));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', apiKey);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), OPENWEATHER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;

    const parsed = OpenWeatherResponse.safeParse(await res.json());
    if (!parsed.success) return null;

    const current = parsed.data.weather?.[0];
    const tempC = Math.round(parsed.data.main.temp);
    const snapshot: WeatherSnapshot = {
      tempC,
      condition: conditionLabel(current?.main, current?.description),
      city: parsed.data.name ?? opts.fallbackCity ?? DEFAULT_CITY,
      weatherTag: tagForProviderWeather(current?.main, tempC),
    };
    weatherCache.set(key, {
      expiresAt: Date.now() + OPENWEATHER_CACHE_MS,
      snapshot,
    });
    return snapshot;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function buildWeatherSnapshot(opts: {
  city: string | null | undefined;
  latitude?: number | null;
  longitude?: number | null;
  /** Provided in tests so the wobble is deterministic; otherwise random. */
  rng?: () => number;
}): Promise<WeatherSnapshot> {
  if (opts.latitude != null && opts.longitude != null) {
    const providerSnapshot = await fetchOpenWeatherSnapshot({
      latitude: opts.latitude,
      longitude: opts.longitude,
      fallbackCity: opts.city,
    });
    if (providerSnapshot) return providerSnapshot;
  }

  return fallbackWeatherSnapshot({ city: opts.city, rng: opts.rng });
}
