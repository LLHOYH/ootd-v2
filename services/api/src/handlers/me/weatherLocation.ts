// PUT /me/weather-location — owner-only device location for weather.

import {
  UpsertWeatherLocationBody,
  type UpsertWeatherLocationResponse,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const LOCATION_PRECISION = 1000;

function roundedCoordinate(value: number): number {
  return Math.round(value * LOCATION_PRECISION) / LOCATION_PRECISION;
}

export const upsertWeatherLocationHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: UpsertWeatherLocationBody }, ctx);
  const latitude = roundedCoordinate(body.latitude);
  const longitude = roundedCoordinate(body.longitude);

  const { data, error } = await supabase
    .from('user_weather_locations')
    .upsert(
      {
        user_id: userId,
        latitude,
        longitude,
        city: body.city ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('latitude, longitude, city, updated_at')
    .single();

  if (error) {
    throw new ApiError(
      500,
      'DB_ERROR',
      `Failed to save weather location: ${error.message}`,
    );
  }

  const responseBody: UpsertWeatherLocationResponse = {
    latitude: data.latitude,
    longitude: data.longitude,
    updatedAt: data.updated_at,
  };
  if (data.city) responseBody.city = data.city;

  return { status: 200, body: responseBody };
};
