// Today contracts — SPEC.md §7.2 "Today" (with shape from §10.1).

import { z } from 'zod';
import { zCombination, zOccasion, zWeatherTag } from '../entities.js';
import { paginated, Pagination, zIso } from './shared.js';

// ---------- Sub-shapes for the aggregated /today payload ----------

export const zWeatherSnapshot = z.object({
  tempC: z.number(),
  condition: z.string(), // free-text e.g. "Cloudy"
  city: z.string(),
  weatherTag: zWeatherTag,
});
export type WeatherSnapshot = z.infer<typeof zWeatherSnapshot>;

export const zCalendarEvent = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: zIso,
  endsAt: zIso.optional(),
  occasionGuess: zOccasion.optional(),
  locationName: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof zCalendarEvent>;

/** A community-look thumbnail in the §10.1 "What others are wearing" strip. */
export const zCommunityLook = z.object({
  ootdId: z.string(),
  userId: z.string(),
  username: z.string(),
  thumbnailUrl: z.string().url(),
  ageBand: z.string().optional(), // e.g. "20-24" — anonymized per §12.6
  countryCode: z.string().length(2).optional(),
});
export type CommunityLook = z.infer<typeof zCommunityLook>;

/** P2 — Fashion-now editorial card. P0/P1 returns empty array. */
export const zFashionNowCard = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string().url(),
  sourceUrl: z.string().url(),
  publishedAt: zIso,
});
export type FashionNowCard = z.infer<typeof zFashionNowCard>;

// ---------- GET /today ----------

export const GetTodayResponse = z.object({
  weather: zWeatherSnapshot.optional(),
  events: z.array(zCalendarEvent),
  todaysPick: zCombination.optional(),
  communityLooks: z.array(zCommunityLook),
  fashionNow: z.array(zFashionNowCard),
});
export type GetTodayResponse = z.infer<typeof GetTodayResponse>;

// ---------- POST /today/another-pick ----------

export const AnotherPickBody = z
  .object({
    occasion: zOccasion.optional(),
    excludeComboIds: z.array(z.string()).optional(),
  })
  .optional();
export type AnotherPickBody = z.infer<typeof AnotherPickBody>;

export const AnotherPickResponse = z.object({
  pick: zCombination,
});
export type AnotherPickResponse = z.infer<typeof AnotherPickResponse>;

// ---------- GET /today/community-looks ----------

export const CommunityLooksQuery = Pagination;
export type CommunityLooksQuery = z.infer<typeof CommunityLooksQuery>;

export const CommunityLooksResponse = paginated(zCommunityLook);
export type CommunityLooksResponse = z.infer<typeof CommunityLooksResponse>;
