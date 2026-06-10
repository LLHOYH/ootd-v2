// Me contracts — caller-scoped helpers that don't belong to public profile.

import { z } from 'zod';
import { zOccasion } from '../entities.js';
import { zIso } from './shared.js';

const zLatitude = z.number().min(-90).max(90);
const zLongitude = z.number().min(-180).max(180);
const zCalendarText = z.string().trim().min(1).max(200);

// ---------- GET /me/likes ----------

export const MeLikesResponse = z.object({
  comboIds: z.array(z.string().uuid()),
});
export type MeLikesResponse = z.infer<typeof MeLikesResponse>;

// ---------- POST /me/likes ----------

export const LikeCombinationBody = z.object({
  comboId: z.string().uuid(),
});
export type LikeCombinationBody = z.infer<typeof LikeCombinationBody>;

export const LikeCombinationResponse = z.object({
  comboId: z.string().uuid(),
  liked: z.literal(true),
});
export type LikeCombinationResponse = z.infer<typeof LikeCombinationResponse>;

// ---------- DELETE /me/likes/{comboId} ----------

export const UnlikeCombinationResponse = z.object({
  comboId: z.string().uuid(),
  liked: z.literal(false),
});
export type UnlikeCombinationResponse = z.infer<typeof UnlikeCombinationResponse>;

// ---------- PUT /me/weather-location ----------

export const UpsertWeatherLocationBody = z.object({
  latitude: zLatitude,
  longitude: zLongitude,
  city: z.string().min(1).max(100).optional(),
});
export type UpsertWeatherLocationBody = z.infer<typeof UpsertWeatherLocationBody>;

export const UpsertWeatherLocationResponse = z.object({
  latitude: zLatitude,
  longitude: zLongitude,
  city: z.string().optional(),
  updatedAt: zIso,
});
export type UpsertWeatherLocationResponse = z.infer<
  typeof UpsertWeatherLocationResponse
>;

// ---------- PUT /me/calendar-events ----------

export const zCalendarEventSyncInput = z.object({
  id: z.string().trim().min(1).max(200),
  title: zCalendarText,
  startsAt: zIso,
  endsAt: zIso.optional(),
  occasionGuess: zOccasion.optional(),
  locationName: zCalendarText.optional(),
});
export type CalendarEventSyncInput = z.infer<typeof zCalendarEventSyncInput>;

export const UpsertCalendarEventsBody = z.object({
  rangeStart: zIso,
  rangeEnd: zIso,
  events: z.array(zCalendarEventSyncInput).max(25),
});
export type UpsertCalendarEventsBody = z.infer<typeof UpsertCalendarEventsBody>;

export const UpsertCalendarEventsResponse = z.object({
  eventCount: z.number().int().min(0),
  updatedAt: zIso,
});
export type UpsertCalendarEventsResponse = z.infer<
  typeof UpsertCalendarEventsResponse
>;
