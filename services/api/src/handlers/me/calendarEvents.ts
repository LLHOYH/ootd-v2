// PUT /me/calendar-events — owner-only device calendar snapshot for Today.

import {
  UpsertCalendarEventsBody,
  type UpsertCalendarEventsResponse,
} from '@mei/types';

import type { Handler } from '../../context';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { validate } from '../../middleware/validate';

const MAX_SYNC_WINDOW_MS = 48 * 60 * 60 * 1000;

function parseTime(iso: string, label: string): number {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) {
    throw new ApiError(400, 'VALIDATION', `${label} must be a valid ISO timestamp`);
  }
  return time;
}

export const upsertCalendarEventsHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);
  const { body } = validate({ body: UpsertCalendarEventsBody }, ctx);

  const rangeStartMs = parseTime(body.rangeStart, 'rangeStart');
  const rangeEndMs = parseTime(body.rangeEnd, 'rangeEnd');
  if (rangeEndMs <= rangeStartMs) {
    throw new ApiError(400, 'VALIDATION', 'rangeEnd must be after rangeStart');
  }
  if (rangeEndMs - rangeStartMs > MAX_SYNC_WINDOW_MS) {
    throw new ApiError(400, 'VALIDATION', 'Calendar sync range must be 48h or less');
  }

  const updatedAt = new Date().toISOString();
  const rows = body.events
    .filter((event) => {
      const startsAt = parseTime(event.startsAt, 'events.startsAt');
      return startsAt >= rangeStartMs && startsAt < rangeEndMs;
    })
    .map((event) => ({
      user_id: userId,
      device_event_id: event.id,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt ?? null,
      location_name: event.locationName ?? null,
      occasion_guess: event.occasionGuess ?? null,
      updated_at: updatedAt,
    }));

  const { error: deleteError } = await supabase
    .from('user_calendar_events')
    .delete()
    .eq('user_id', userId)
    .gte('starts_at', body.rangeStart)
    .lt('starts_at', body.rangeEnd);

  if (deleteError) {
    if (deleteError.code === '42P01') {
      const responseBody: UpsertCalendarEventsResponse = {
        eventCount: 0,
        updatedAt,
      };
      return { status: 200, body: responseBody };
    }
    throw new ApiError(
      500,
      'DB_ERROR',
      `Failed to clear calendar events: ${deleteError.message}`,
    );
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('user_calendar_events')
      .upsert(rows, { onConflict: 'user_id,device_event_id' });

    if (upsertError) {
      throw new ApiError(
        500,
        'DB_ERROR',
        `Failed to save calendar events: ${upsertError.message}`,
      );
    }
  }

  const responseBody: UpsertCalendarEventsResponse = {
    eventCount: rows.length,
    updatedAt,
  };
  return { status: 200, body: responseBody };
};
