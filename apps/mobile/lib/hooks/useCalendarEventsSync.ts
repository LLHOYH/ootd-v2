// useCalendarEventsSync — opportunistically refresh Today's calendar strip.
//
// Runs silently from Today. Permission denial keeps the strip hidden; a
// successful sync asks Today to refetch so /today can return saved events.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { useEffect, useRef } from 'react';
import type { CalendarEventSyncInput, Occasion } from '@mei/types';

import { upsertCalendarEvents } from '../api/me';
import { useSession } from '../auth/SessionProvider';

const STORAGE_KEY_PREFIX = 'mei-calendar-events:last-sync:';
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const MAX_EVENTS = 25;

function localDayRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function isoFromCalendarDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function trimmedText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, 200) : undefined;
}

function inferOccasion(title: string, location?: string): Occasion {
  const haystack = `${title} ${location ?? ''}`.toLowerCase();
  if (/\b(gym|pilates|run|running|workout|yoga|training)\b/.test(haystack)) {
    return 'WORKOUT';
  }
  if (/\b(wedding|solemnization|reception)\b/.test(haystack)) {
    return 'WEDDING';
  }
  if (/\b(beach|pool|swim|sentosa)\b/.test(haystack)) {
    return 'BEACH';
  }
  if (/\b(date|anniversary)\b/.test(haystack)) {
    return 'DATE';
  }
  if (/\b(dinner|drinks|cocktail|bar|party|gala)\b/.test(haystack)) {
    return 'EVENING';
  }
  if (/\b(brunch|breakfast|coffee|lunch|cafe|bakery)\b/.test(haystack)) {
    return 'BRUNCH';
  }
  if (/\b(work|office|meeting|sync|standup|interview|client|call)\b/.test(haystack)) {
    return 'WORK';
  }
  return 'CASUAL';
}

function eventId(event: Calendar.Event): string | undefined {
  const androidInstanceId = 'instanceId' in event ? event.instanceId : undefined;
  return trimmedText(androidInstanceId ?? event.id);
}

function mapEvent(event: Calendar.Event): CalendarEventSyncInput | null {
  const id = eventId(event);
  const title = trimmedText(event.title);
  const startsAt = isoFromCalendarDate(event.startDate);
  if (!id || !title || !startsAt) return null;

  const locationName = trimmedText(event.location);
  const endsAt = isoFromCalendarDate(event.endDate);
  return {
    id,
    title,
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    ...(locationName ? { locationName } : {}),
    occasionGuess: inferOccasion(title, locationName),
  };
}

export function useCalendarEventsSync(onSynced?: () => void | Promise<void>): void {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

    (async () => {
      const lastSyncRaw = await AsyncStorage.getItem(storageKey);
      const lastSync = lastSyncRaw ? Number(lastSyncRaw) : 0;
      if (Number.isFinite(lastSync) && Date.now() - lastSync < SYNC_INTERVAL_MS) {
        return;
      }

      let permission = await Calendar.getCalendarPermissionsAsync();
      if (permission.status === 'undetermined') {
        permission = await Calendar.requestCalendarPermissionsAsync();
      }
      if (cancelled || permission.status !== 'granted') return;

      const { start, end } = localDayRange();
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = calendars
        .map((calendar) => trimmedText(calendar.id))
        .filter((id): id is string => Boolean(id));

      const rawEvents =
        calendarIds.length > 0
          ? await Calendar.getEventsAsync(calendarIds, start, end)
          : [];
      if (cancelled) return;

      const events = rawEvents
        .map(mapEvent)
        .filter((event): event is CalendarEventSyncInput => Boolean(event))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, MAX_EVENTS);

      await upsertCalendarEvents({
        rangeStart: start.toISOString(),
        rangeEnd: end.toISOString(),
        events,
      });
      await AsyncStorage.setItem(storageKey, String(Date.now()));
      if (!cancelled) await onSyncedRef.current?.();
    })().catch(() => {
      // Calendar context is optional; keep Today on its existing empty strip.
    });

    return () => {
      cancelled = true;
    };
  }, [sessionLoading, userId]);
}
