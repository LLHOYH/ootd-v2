// Adapters between the api `/today` contract and the strip-component prop
// shapes. Pure mappers — no networking, no state.

import type {
  CalendarEvent,
  CommunityLook,
  FashionNowCard,
  Occasion,
  WeatherSnapshot,
} from '@mei/types';
import type {
  TodayCommunityLook,
  TodayEventCard,
  TodayFashionItem,
  TodayWeather,
} from './types';

/** WeatherSnapshot → TodayWeather. Three fields overlap exactly. */
export function adaptWeather(w: WeatherSnapshot): TodayWeather {
  return { tempC: w.tempC, condition: w.condition, city: w.city };
}

/** Format an ISO timestamp as a 24h `HH:mm` label in the device's local TZ. */
function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const DEFAULT_OCCASION: Occasion = 'CASUAL';

/** CalendarEvent → TodayEventCard. */
export function adaptEvent(e: CalendarEvent): TodayEventCard {
  return {
    id: e.id,
    startLabel: formatStartLabel(e.startsAt),
    title: e.title,
    locationName: e.locationName ?? '',
    occasion: e.occasionGuess ?? DEFAULT_OCCASION,
  };
}

/** CommunityLook → TodayCommunityLook. Initials are first 2 alpha chars. */
export function adaptCommunityLook(c: CommunityLook): TodayCommunityLook {
  const cleaned = c.username.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const initials = cleaned.slice(0, 2) || c.username.slice(0, 2).toUpperCase();
  return {
    id: c.ootdId,
    initials,
    username: c.username,
  };
}

/**
 * FashionNowCard → TodayFashionItem. The contract carries `title` + a
 * `sourceUrl`; the strip shows a short source label above a one-line
 * caption. Until the editorial RSS lands (P2), derive the source label
 * from the URL host and use the title as the caption.
 */
export function adaptFashionNow(f: FashionNowCard): TodayFashionItem {
  let host = '';
  try {
    host = new URL(f.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const source = host || 'Editorial';
  return {
    id: f.id,
    source,
    caption: f.title,
  };
}
