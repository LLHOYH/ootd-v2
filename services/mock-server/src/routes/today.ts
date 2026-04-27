// SPEC.md §7.2 "Today".
//
// /today returns a realistic-feeling aggregate: today's weather (Singapore-ish
// numbers, randomly tweaked each request), today's calendar events anchored
// at the current local date, today's pick combination, 5 community looks
// from the seeded friend pool, and 4 fashion-now cards.

import type {
  FastifyInstance,
  FastifyPluginAsync,
} from 'fastify';
import { z } from 'zod';
import type { CommunityLook, FashionNowCard } from '@mei/types';
import {
  AnotherPickBody,
  AnotherPickResponse,
  CommunityLooksQuery,
  CommunityLooksResponse,
  GetTodayResponse,
} from '@mei/types';
import { store } from '../fixtures/index.js';
import { requireUserId } from '../util/auth.js';
import { sendError } from '../util/errors.js';
import { validateResponse, withSchema } from '../middleware/validate.js';
import { paginate } from '../util/paginate.js';

const PHOTO = 'https://placehold.co/600x900/F2EAD9/3D4856?text=Mei';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Compose 3 events anchored at today's date in the user's local timezone (UTC for mocks). */
function todayEvents(): { id: string; title: string; startsAt: string; endsAt?: string; occasionGuess: 'BRUNCH' | 'DATE' | 'EVENING'; locationName: string }[] {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = pad2(now.getUTCMonth() + 1);
  const dd = pad2(now.getUTCDate());
  const day = `${yyyy}-${mm}-${dd}`;
  return [
    {
      id: 'evt_1',
      title: 'Brunch with Mei',
      startsAt: `${day}T03:00:00.000Z`, // 11:00 SGT
      endsAt: `${day}T05:00:00.000Z`,
      occasionGuess: 'BRUNCH',
      locationName: 'Tiong Bahru',
    },
    {
      id: 'evt_2',
      title: 'Dinner · Anna',
      startsAt: `${day}T11:00:00.000Z`, // 19:00 SGT
      endsAt: `${day}T13:00:00.000Z`,
      occasionGuess: 'DATE',
      locationName: 'Keong Saik',
    },
    {
      id: 'evt_3',
      title: 'Drinks at Atlas',
      startsAt: `${day}T13:30:00.000Z`,
      occasionGuess: 'EVENING',
      locationName: 'Bugis',
    },
  ];
}

function communityLooksFromStore(limit: number): CommunityLook[] {
  return [...store.ootds.values()]
    .filter((o) => o.userId !== 'u_sophia' && o.visibility === 'PUBLIC')
    .slice(0, limit)
    .map((o) => {
      const user = store.users.get(o.userId);
      const look: CommunityLook = {
        ootdId: o.ootdId,
        userId: o.userId,
        username: user?.username ?? o.userId,
        thumbnailUrl: o.tryOnPhotoUrl ?? PHOTO,
        ageBand: '25-29',
      };
      if (user?.countryCode) {
        look.countryCode = user.countryCode;
      }
      return look;
    });
}

const FASHION_NOW: FashionNowCard[] = [
  {
    id: 'fn_1',
    title: 'Slip dresses, layered',
    imageUrl: 'https://placehold.co/600x800/F2EAD9/3D4856?text=Paris+FW',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-20T09:00:00.000Z',
  },
  {
    id: 'fn_2',
    title: 'Tan leather, head to toe',
    imageUrl: 'https://placehold.co/600x800/DCC9B6/3D4856?text=Editorial',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-22T09:00:00.000Z',
  },
  {
    id: 'fn_3',
    title: 'Sheer knits over cotton',
    imageUrl: 'https://placehold.co/600x800/E5D5E0/3D4856?text=Instagram',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-24T09:00:00.000Z',
  },
  {
    id: 'fn_4',
    title: 'Ballet flats are back',
    imageUrl: 'https://placehold.co/600x800/D5DDD0/3D4856?text=Milan+FW',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-25T09:00:00.000Z',
  },
];

const todayRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/today', async (request) => {
    const userId = requireUserId(request);
    const user = store.users.get(userId);

    // Vary the temp by ±2 each call so the UI doesn't look totally static.
    const tempC = 26 + Math.round(Math.random() * 4);
    const weather = {
      tempC,
      condition: tempC >= 28 ? 'Sunny' : 'Cloudy',
      city: user?.city ?? 'Singapore',
      weatherTag: (tempC >= 28 ? 'HOT' : 'WARM') as 'HOT' | 'WARM',
    };

    const todaysPickComboId = store.todaysPickComboId;
    const todaysPick =
      todaysPickComboId !== null
        ? store.combinations.get(todaysPickComboId)
        : undefined;

    const payload = {
      weather,
      events: todayEvents(),
      todaysPick,
      communityLooks: communityLooksFromStore(5),
      fashionNow: FASHION_NOW,
    };
    return validateResponse(request, GetTodayResponse, payload);
  });

  app.post(
    '/today/another-pick',
    withSchema({ body: AnotherPickBody }, async (request, reply) => {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as z.infer<typeof AnotherPickBody>;
      const excludes = new Set(body?.excludeComboIds ?? []);
      const candidates = store
        .combinationsForUser(userId)
        .filter((c) => !excludes.has(c.comboId));
      if (body?.occasion) {
        const filtered = candidates.filter((c) =>
          c.occasionTags.includes(body.occasion!),
        );
        if (filtered.length > 0) candidates.splice(0, candidates.length, ...filtered);
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) {
        return sendError(
          reply,
          404,
          'NO_PICK',
          'No combinations available to pick from',
        );
      }
      // Rotate the seeded "today's pick" so /today reflects the alt next time.
      store.todaysPickComboId = pick.comboId;
      return validateResponse(request, AnotherPickResponse, { pick });
    }),
  );

  app.get(
    '/today/community-looks',
    withSchema({ query: CommunityLooksQuery }, async (request) => {
      requireUserId(request);
      const q = request.query as z.infer<typeof CommunityLooksQuery>;
      const all = communityLooksFromStore(50);
      const page = paginate(all, q.cursor, q.limit);
      return validateResponse(request, CommunityLooksResponse, page);
    }),
  );
};

export default todayRoutes;
