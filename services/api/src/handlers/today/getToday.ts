// GET /today — aggregate Today payload (SPEC §7.2 + §10.1).
//
// One handler, one response. Sub-payloads:
//   - weather: stub (see ./weather.ts) until a real provider is wired.
//   - events:  empty array. Calendar permission lives on the client; the
//              backend has no calendar source yet.
//              TODO(calendar-provider): if/when the OS calendar push
//              syncs into Postgres, source it here.
//   - todaysPick: most-recently-created combination owned by the user.
//              Per §8.5 the production path is a one-shot Stella call;
//              that lives in feat/stella-api so we degrade gracefully.
//              TODO(stella-today-pick): replace with a Stella one-shot.
//   - communityLooks: top 5 from the same query that powers
//              /today/community-looks (§10.1 strip is small).
//   - fashionNow: hardcoded placeholder cards. P2 per §13.3.
//              TODO(fashion-now-rss): pull from an editorial RSS feed.

import type { Handler } from '../../context';
import type {
  Combination as ApiCombination,
  CommunityLook,
  FashionNowCard,
  GetTodayResponse,
  Tables,
  WeatherSnapshot,
} from '@mei/types';
import { ApiError } from '../../errors';
import { requireAuthCtx } from '../../lib/handlerCtx';
import { config } from '../../lib/config';
import { fetchCommunityLooks } from './communityLooks';
import { mapCombination, mapCommunityLook, type CombinationWithItems } from './shared';
import { buildWeatherSnapshot } from './weather';

const COMMUNITY_LOOKS_STRIP_SIZE = 5;

// P2 placeholder cards — same shape as the mock-server (§13.3 markers it
// as P2). Hardcoded URLs intentionally; no fixture file.
const FASHION_NOW_PLACEHOLDER: FashionNowCard[] = [
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

export const getTodayHandler: Handler = async (ctx) => {
  const { userId, supabase } = requireAuthCtx(ctx);

  // 1. Profile — RLS scopes to the caller. `maybeSingle` so a freshly
  //    auth'd user with no `users` row yet doesn't 500 the Today screen.
  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('city')
    .eq('user_id', userId)
    .maybeSingle();
  if (meErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load user profile: ${meErr.message}`);
  }

  // 2. Weather. Stubbed; see ./weather.ts.
  // §10.1 says the strip hides silently when weather is unavailable, so
  // an absent profile (no city) → omit the weather snapshot rather than
  // returning a synthetic city.
  let weather: WeatherSnapshot | undefined;
  if (me) {
    weather = buildWeatherSnapshot({ city: me.city });
  }

  // 3. Events.
  // TODO(calendar-provider): the OS-side calendar push hasn't landed yet.
  // Returning [] here matches §10.1's "no calendar permission: hide
  // calendar strip silently" empty state.
  const events: GetTodayResponse['events'] = [];

  // 4. Today's pick.
  // TODO(stella-today-pick): replace with the §8.5 one-shot Stella call
  // (cached per user per day). For now: most recent combination.
  let todaysPick: ApiCombination | undefined;
  const { data: comboRows, error: comboErr } = await supabase
    .from('combinations')
    .select(
      `combo_id,
       user_id,
       name,
       occasion_tags,
       source,
       created_at,
       combination_items (
         item_id,
         position
       )`,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (comboErr) {
    throw new ApiError(500, 'DB_ERROR', `Failed to load combinations: ${comboErr.message}`);
  }
  // Row shape: every column on `combinations` plus the joined items.
  type ComboRow = Tables<'combinations'> & {
    combination_items: { item_id: string; position: number }[] | null;
  };
  const firstCombo = ((comboRows ?? []) as ComboRow[])[0];
  if (firstCombo) {
    const withItems: CombinationWithItems = {
      row: {
        combo_id: firstCombo.combo_id,
        user_id: firstCombo.user_id,
        name: firstCombo.name,
        occasion_tags: firstCombo.occasion_tags,
        source: firstCombo.source,
        created_at: firstCombo.created_at,
      },
      items: firstCombo.combination_items ?? [],
    };
    todaysPick = mapCombination(withItems);
  }

  // 5. Community looks (top 5).
  let communityLooks: CommunityLook[] = [];
  try {
    const rows = await fetchCommunityLooks(supabase, userId, {
      offset: 0,
      limit: COMMUNITY_LOOKS_STRIP_SIZE,
    });
    communityLooks = rows.map((r) => mapCommunityLook(r, config.supabaseUrl));
  } catch (err) {
    // §10.1 says don't block the page on a slow community-looks call.
    // Same applies to a failure: log + render the rest. The
    // dispatcher's logger picks this up.
    // eslint-disable-next-line no-console
    console.error('[today] community-looks failed; rendering empty strip', err);
    communityLooks = [];
  }

  // 6. Fashion now — P2 placeholder.
  // TODO(fashion-now-rss): pull from a real editorial RSS feed (P2 per §13.3).
  const fashionNow = FASHION_NOW_PLACEHOLDER;

  // Build the response. We build a `Partial`-ish union and only attach
  // `weather` / `todaysPick` when defined so the JSON envelope omits
  // them rather than returning explicit `null`s — the contract has them
  // as `.optional()`, not `.nullable()`.
  const body: GetTodayResponse = {
    events,
    communityLooks,
    fashionNow,
  };
  if (weather) body.weather = weather;
  if (todaysPick) body.todaysPick = todaysPick;

  return { status: 200, body };
};
