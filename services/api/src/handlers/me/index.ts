// Caller-scoped endpoints.

import type { Handler } from '../../context';
import type { RouteDef } from '../../router';
import { attachSupabaseClient } from '../..';
import { requireAuth } from '../../middleware/auth';
import {
  likeCombinationHandler,
  listLikesHandler,
  unlikeCombinationHandler,
} from './likes';
import { upsertCalendarEventsHandler } from './calendarEvents';
import { upsertWeatherLocationHandler } from './weatherLocation';

const wrap = (h: Handler): Handler => requireAuth(attachSupabaseClient(h));

export const meRoutes: RouteDef[] = [
  {
    method: 'PUT',
    path: '/me/weather-location',
    handler: wrap(upsertWeatherLocationHandler),
  },
  {
    method: 'PUT',
    path: '/me/calendar-events',
    handler: wrap(upsertCalendarEventsHandler),
  },
  { method: 'GET', path: '/me/likes', handler: wrap(listLikesHandler) },
  { method: 'POST', path: '/me/likes', handler: wrap(likeCombinationHandler) },
  {
    method: 'DELETE',
    path: '/me/likes/:comboId',
    handler: wrap(unlikeCombinationHandler),
  },
];
