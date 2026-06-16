# Session handoff — Mei dogfooding state

> **Purpose.** Drop this into a new Claude conversation alongside `CLAUDE.md`
> and `SPEC.md` to skip the cold-start cost of re-deriving everything
> from the codebase. Capture point-in-time state: what's shipped, what's
> open, how to run the app, and the gotchas that took us several PRs to
> work around.
>
> **Lifespan.** Refresh after every meaningful product milestone (e.g.
> after each major feature merges). Outdated state here is worse than
> nothing — when in doubt, regenerate.
>
> **Last updated:** 2026-06-08, after `feat/tryon-dogfood-fixes`
> landed locally plus Codex follow-ups for Stack option refs,
> try-on share preview, saved-look like persistence, and device
> weather-location sync, device calendar sync, plus a first-pass QA
> sweep across Closet, Friends, Chats, and You. See **Branch State**
> below.

---

## TL;DR

Mei is a digital wardrobe + AI stylist app. Lloyd is the founder and
sole dogfooder. The app is being walked screen-by-screen with bugs and
missing features filed and fixed in tight PR cycles. Today, the
**Today tab** and **selfie + try-on flow** are functional end-to-end.
Closet / Friends / Chats / You now have first-pass QA fixes in place;
deeper runtime dogfood is still needed before calling them done.

## Branch State

The previous Claude session moved the dogfood fixes onto
`feat/tryon-dogfood-fixes` and pushed the branch. The work was driven
by walking through the try-on flow on the phone and fixing each thing
that broke. **Before moving past try-on, verify the runtime items
below and decide whether to merge this branch or keep iterating.**

| # | File                                                          | What                                                                                                                              | Verified?      |
| - | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1 | `apps/mobile/app/tryon.tsx`                                   | `useMemo` around the `Stack.Screen` `screenOptions` object — fixes a "Maximum update depth exceeded" render loop. Same shape as PR #71's fix on `/share`. | YES (Lloyd)    |
| 2 | `supabase/migrations/0009_tryon_cap_dogfood.sql`              | Bumps the daily try-on cap from 10 → 250 (Lloyd's $10/day budget) and stops counting `FAILED` rows so Replicate flakes don't burn slots. **Needs Studio paste.** | UNVERIFIED — paste status unclear, but mobile saw the cap working. |
| 3 | `services/api/src/handlers/tryon/createTryon.ts`              | Two lines: 10/day → 250/day in user-facing error message + comment. Belongs with #2.                                              | restart-confirmed, error-path untested |
| 4 | `services/api/src/handlers/tryon/createTryon.ts`, `services/image-worker/src/pipeline/generateTryon.ts`, `services/image-worker/src/providers/tryon.ts` | Step-narrator `console.log`s tagged `[tryon <id>]` across the api Lambda + image-worker pipeline + Replicate provider. Shows what's happening during the 15-30s wait. | YES (used to diagnose #5) |
| 5 | `services/image-worker/src/pipeline/generateTryon.ts`         | Downscales selfies to ≤1280px via `sharp` before encoding as data URI for Replicate. Without this, 5 MB iPhone selfies → 7 MB JSON body → `fetch failed` after ~40s. | **NEEDS PHONE RETEST.** Lloyd hit the bug, fix applied, but no successful generation has been observed after the fix. |
| 6 | `apps/mobile/lib/api/client.ts`                               | When `JSON.parse` fails on an API response, `console.warn` the first 500 chars of the body to Metro so we can see what came back (ngrok HTML page? lambda stack trace? empty?). Defensive — no longer triggering the original symptom but worth keeping. | YES (passive)  |
| 7 | `supabase/migrations/0010_combination_likes.sql`, `services/api/src/handlers/me`, `apps/mobile/lib/hooks/useCombinationLikes.ts`, `apps/mobile/app/(tabs)/today.tsx` | Persists the Today's Pick heart via `/me/likes` and an RLS-scoped `combination_likes` table. Optimistic mobile toggle rolls back on API failure. **Needs Studio paste.** | typecheck YES, runtime UNVERIFIED |
| 8 | `supabase/migrations/0011_user_weather_locations.sql`, `apps/mobile/lib/hooks/useWeatherLocationSync.ts`, `services/api/src/handlers/today/weather.ts` | Syncs rounded foreground device coords into an owner-only table. `/today` uses OpenWeatherMap when `OPENWEATHER_API_KEY` is set, and falls back to the existing city stub when key/coords/table are absent. **Needs Studio paste + phone permission test.** | typecheck YES, runtime UNVERIFIED |
| 9 | `apps/mobile/app/(tabs)/closet.tsx`, `apps/mobile/app/(tabs)/friends.tsx`, `apps/mobile/app/(tabs)/chats/*`, `apps/mobile/app/(tabs)/you.tsx`, related tab components/hooks | First-pass tab QA: Closet search is wired, combination taps open try-on, Friends empty feed points to Add Friends, chat detail keeps the thread title and Stella error can retry, You rows no longer show fake actions. | typecheck YES, runtime UNVERIFIED |
| 10 | `supabase/migrations/0012_user_calendar_events.sql`, `apps/mobile/lib/hooks/useCalendarEventsSync.ts`, `services/api/src/handlers/me/calendarEvents.ts`, `services/api/src/handlers/today/getToday.ts` | Syncs today's OS calendar events into an owner-only table via `expo-calendar`; `/today` returns up to 2 upcoming events and falls back to `[]` when permission/table are absent. **Needs Studio paste + phone calendar permission test.** | typecheck YES, runtime UNVERIFIED |

**Try-on verification action:** restart `pnpm services`, fire one
try-on from the phone, and confirm:
- Step logs run all the way through `complete in Ns` (not `failed`).
- `[tryon <id>] using model photo ... as person reference` appears
  before the Replicate POST.
- The phone shows the generated image (not "Couldn't generate this
  look").

If that works, this session's open product question — **how good is
Nano Banana Pro try-on output quality?** — is finally unblocked. The
cost ledger should also show a successful generation in Replicate.

If it does NOT work and the log still says `fetch failed`, the
hypothesis was wrong; investigate the network/Replicate path, not
body size. The downscale log line will confirm the resize worked even
if the upload still dies.

## Stack reality (as of this doc)

CLAUDE.md says SDK 52 + AWS Lambda + DynamoDB + S3. The truth right
now is:

- **Mobile:** Expo SDK **54**, RN 0.81, React 19, expo-router 6. Runs
  in Expo Go on iOS (no custom dev client yet).
- **Backend:** Supabase (Postgres + RLS + Storage). No AWS yet — the
  AWS migration is a planned future stack swap; the live backend is
  Supabase. `services/api` is a Node-Fastify service in front of it.
- **Image processing:** `services/image-worker` (Fastify) handles
  closet-item promotion and try-on synthesis.
- **External AI:** Replicate Nano Banana Pro for closet cleanup, model
  photos, and try-on; Anthropic Claude for Stella conversations.
- **Hosted:** None yet. Everything runs on Lloyd's machine. The phone
  reaches the backend via ngrok and Metro via Cloudflare Quick Tunnel.

Don't update CLAUDE.md to reflect this unless asked — that's a
deliberate decision about source-of-truth ordering.

## How to dogfood right now

Three terminals, in order:

```bash
# 1. Backend services (api, stylist, image-worker, notifier)
pnpm services

# 2. ngrok tunnel for the backend (reserved static domain)
pnpm tunnel

# 3. Cloudflare Quick Tunnel + Metro for the phone
pnpm mobile:tunnel
```

The scripts auto-handle several known issues (Expo's broken
@expo/ngrok wrapper, the ngrok v2 protocol rejection, `tunnel.sh`
process subtree cleanup). Don't peel that work off without reading the
PR history (#62, #67, #68, #69, #70, #73).

On the phone: open Expo Go, paste the Cloudflare URL printed by
`pnpm mobile:tunnel`. Re-paste each time because the URL is random.

## What ships end-to-end today

### Today tab (SPEC §10.1)

- **Header** + greeting, refreshes display name + selfie count on focus.
- **Setup banner** (gated `selfieCount < 5 && !dismissed`) → routes to
  `/selfies` and dismissible.
- **Weather strip** — mobile opportunistically asks foreground
  location permission from Today, rounds coords, stores them in
  owner-only `user_weather_locations`, then refetches `/today`.
  Backend uses OpenWeatherMap when `OPENWEATHER_API_KEY` is set and
  falls back to the old city stub otherwise.
- **Calendar strip** — mobile opportunistically asks OS calendar
  permission from Today, syncs the current local-day events into
  owner-only `user_calendar_events`, and refetches `/today`. Backend
  returns up to 2 upcoming events and otherwise hides the strip.
- **Today's Pick** card — server picks the user's most recent
  combination (Stella is not wired yet). Real item photos render via
  `useClosetItemMap`. Heart persists through `/me/likes` with an
  optimistic rollback if the API fails. "Try another" hits
  `/today/another-pick` with the seen-combo exclusion list and
  animates the swap. "Wear this on me" opens **/tryon** (not `/share`
  anymore).
- **Community Looks** — top 5 from `/today/community-looks`.
- **Fashion Now** — real RSS from Elle Fashion + Refinery29 Fashion,
  1h module cache, fallback Unsplash editorial set if all feeds fail.
  Cards open the article in the OS browser via `Linking.openURL`.

### Selfie flow (SPEC §10.14, §9.2)

- `/selfies` — pick from camera or library, store to private `selfies`
  bucket, insert row in `selfies` table. Up to 5 per user enforced by
  the `selfies_max_5_per_user` trigger. Persistent Done button at any
  count. iOS Limited Library failures show an "Open Settings" CTA.
- `useSelfies` hook owns the state machine. Selfie URLs are
  short-lived signed URLs (1h expiry).

### Try-on flow (SPEC §10.10, PR C of the selfie trilogy)

- Today → "Wear this on me" → `/tryon`.
- Backend: `POST /tryon` accepts `{comboId, selfieId?}`. The normal
  mobile path omits `selfieId`, requires the latest READY model photo,
  picks the first wearable item from the combination (DRESS → TOP →
  OUTERWEAR → BOTTOM), checks for a cached READY or already-PENDING
  row, then returns immediately. New work is represented by a PENDING
  `tryon_generations` row.
- `services/image-worker/src/queue/pendingGenerationQueue.ts` polls
  PENDING `model_photos` and `tryon_generations` rows, runs the
  generation pipelines, and promotes each row to READY or FAILED.
- `services/image-worker/src/providers/tryon.ts` wraps Replicate
  Nano Banana Pro image editing with the model photo as reference 1
  and the closet garment as reference 2.
- Person references are downscaled to ≤1280px via `sharp` in the
  pipeline before being encoded as data URIs for the Replicate POST.
  iPhone originals (5-10 MB) would otherwise blow the JSON body up past
  Replicate's accepted size and the `fetch` would die after ~40s.
- The pipeline + provider + api emit step-narrator `console.log`s
  tagged `[tryon <gen-id>]` so the 15-30s wait is legible in
  `pnpm services`. Look for the `starting → processing → succeeded`
  Replicate transitions to see queue-time vs GPU-time.
- Cost: ~$0.04 per generation. Rate-limited at the DB level
  (`tryon_generations_daily_cap`): 250/user/day (was 10; bumped in
  migration `0009`). Only `PENDING` and `READY` rows count against
  the cap; `FAILED` rows are free.
- Mobile preview screen `/tryon.tsx`: queues a try-on, polls while
  mounted, and lets the user leave while the global
  `GenerationQueueProvider` continues polling and shows an in-app toast
  when the result is READY/FAILED. Ready actions are Share with friends
  → `/share`, Regenerate, and Done → back. Error handling per response
  code: `NO_SELFIE` → CTA to `/selfies`, `NO_MODEL_PHOTO` → CTA to
  generate the model photo, `RATE_LIMITED` → surface the cap, anything
  else → Try again button.

### Share flow (SPEC §10.10 form)

- `/share` is the existing caption + visibility + post-creation
  modal. Reached from the try-on preview's "Share with friends"
  button. When reached from `/tryon`, the route now receives the signed
  `tryonImageUrl` and uses it as the local confirmation preview. The
  post-create API contract is unchanged for now, so feed image
  persistence still follows the existing fallback path. PR #71 fixed
  the infinite render loop (`<Stack.Screen options={{...}} />` literal
  rebuilt every render).

### Closet tab (SPEC §10.2)

- Real closet photos already rendered. The header search icon now opens
  an in-place search field, filters items by name/description/category,
  and filters combinations by combo name.
- Tapping a saved combination routes to `/tryon` with the combo payload
  instead of the stale share route. The FAB uses theme tokens instead of
  hardcoded icon color.

### Friends tab (SPEC §10.4)

- Empty feed state now has a primary "Find friends" CTA into
  `/friends/add`.
- Feed reaction toggles guard against concurrent double-taps on the
  same post.

### Chats tab (SPEC §10.6)

- Thread rows pass the selected thread title into chat detail so the
  header stays specific instead of falling back to "Direct message".
- Stella error state now has a working "Try again" action.

### You tab (SPEC §10.11)

- Profile data remains read-only. Rows with real backing flows route to
  selfies, friends, or sign-out; read-only rows no longer render fake
  chevrons or inert press targets.

## What does NOT ship yet

- **Closet / Friends / Chats / You deeper runtime QA** — first-pass
  wiring issues are fixed, but the tabs still need phone dogfood beyond
  typecheck.
- **Stella one-shot for Today's Pick** — server returns the most
  recent combination, no LLM call yet.
- **AWS migration** — long-horizon.

## Known gotchas (don't relitigate without context)

1. **`@expo/ngrok` is broken.** Ships ngrok v2 binary + v2 API shape.
   We bypass entirely via `pnpm mobile:tunnel` (Cloudflare Quick
   Tunnel) — see PRs #67, #68, #69, #70.
2. **Metro `.js`-on-TS-import.** Workspace packages export
   `'./entities.js'` per TS Bundler convention. `apps/mobile/metro.config.js`
   has a resolveRequest hook that retries `.ts` → `.tsx`. Don't add a
   runtime import from `@mei/types` without keeping this in mind. (PR #73)
3. **CLAUDE.md says SDK 52.** It's SDK 54 actually. We upgraded
   because iOS App Store only ships the latest Expo Go. PR #60.
4. **`pnpm tunnel` leaks zombie processes** if killed with a bare
   `kill $pid`. The wrapper now walks the subtree. PR #62.
5. **Pagination cap = 100.** `/closet/items?limit=200` returns 400.
   `useClosetItemMap` was set to 200 and silently broke photos until
   PR #71 dropped it to 100.
6. **Supabase auth via Bearer JWT.** The api Lambda mints a per-request
   RLS-scoped client off the bearer; everywhere else, the supabase-js
   client owns auth. Don't go around it.
7. **Migration files don't auto-apply.** Supabase changes go through
   `supabase/migrations/*.sql` and require the user to paste them into
   Studio's SQL editor (or run `supabase db push --linked` if their
   CLI is logged in). Latest written: `0012_user_calendar_events.sql`
   (paste status unclear — verify against Studio if unsure).
8. **`<Stack.Screen options={…} />` is reference-reconciled by
   expo-router 6.** A fresh object literal each render reads as
   "options changed" and triggers a re-render loop ("Maximum update
   depth exceeded"). Always wrap in `useMemo([])` or hoist outside the
   component. PR #71 fixed `/share`; `feat/tryon-dogfood-fixes`
   fixed `/tryon`; the follow-up pass fixed the same pattern in
   `/craft-a-look`, chat detail, and `/friends/add`.
9. **iPhone selfies are 5-10 MB raw.** Anything that ships them in a
   JSON body to a third-party API needs to downscale first. The
   `sharp(...).resize({...1280...}).jpeg({...}).toBuffer()` pattern
   in `generateTryon.ts` is the reference.
10. **If `pnpm services` appears to duplicate logs, first check for
    multiple service runners.** The current `scripts/dev.sh` redirects
    each child process to a single `/tmp/mei-<service>.log` file and
    tails that file once; it does not tee child stdout to both terminal
    and file. The old duplication note was investigated on 2026-05-24
    and no launcher bug was found in the current script.

## Recent shipped (compact PR ledger)

Most recent first. One line each.

| PR  | What                                                               |
| --- | ------------------------------------------------------------------ |
| #76 | feat(mobile): try-on preview screen (PR C.2)                       |
| #75 | feat(api,image-worker): try-on backend foundation (PR C.1)         |
| #74 | fix(mobile): selfies UX — persistent Done, picker errors, copy     |
| #73 | fix(mobile): Metro resolves `.js` on TS-source imports             |
| #72 | feat(mobile): selfies screen — pick, upload, list, delete (PR A)   |
| #71 | fix(mobile): Today's Pick + Fashion Now photos, share modal loop   |
| #70 | fix(scripts): Metro tunnel via Cloudflare Quick Tunnel             |
| #69 | refactor(scripts): bypass @expo/ngrok, share one ngrok agent       |
| #68 | fix(scripts): patch @expo/ngrok /api/tunnels payload for ngrok 3   |
| #67 | fix(scripts): patch around dead ngrok v2 binary in @expo/ngrok     |
| #66 | chore(scripts): pnpm mobile:tunnel shortcut                        |
| #65 | feat(api): Fashion now from real RSS feeds                         |
| #64 | feat(mobile): real item photos in OutfitCard                       |
| #63 | fix(mobile): Today screen wiring (4 dead CTAs)                     |
| #62 | fix(scripts): tunnel.sh walks process subtree on shutdown          |
| #61 | fix(mobile): swap react-native-mmkv → AsyncStorage                 |
| #60 | chore(mobile): upgrade Expo SDK 52 → 54                            |

## Queued tasks / chips

These were filed as session chips for future work. They're not in any
issue tracker; tracking them lives here:

1. **Try-on output-quality assessment.** Once the downscale/model
   reference fixes are verified and Lloyd has generated a real try-on,
   judgement call on face fidelity, garment fidelity, hand glitches.
   Decides whether we stay on the current Replicate Nano Banana Pro
   edit flow or evaluate alternatives.
2. **Today carousel + overnight recommendations.** Replace the
   section-level "Try another" action with a swipeable Today's Pick
   carousel. Backend should pre-generate at least 4 daily outfit
   recommendations for each active user, ideally the night before or
   before the morning open. Inputs: closet items, weather, calendar
   events, and future style preferences. Store both the recommended
   combination metadata and any ready model try-on image so `/today`
   can return finished looks immediately, with closet-photo fallback
   only while generation is still pending.

## Conventions you'll notice in the codebase

- Per-domain handlers under `services/api/src/handlers/<domain>/`,
  registered via that domain's `index.ts`. Don't touch
  `services/api/src/handlers/index.ts` to add domain logic, only to
  register the new domain.
- All RLS-relevant queries go through the user-scoped supabase client
  (mounted as `ctx.supabase` by the dispatcher middleware), never the
  service-role client. The image-worker is the exception — it's
  service-role end-to-end because it's a worker, not a user-facing
  surface.
- Mobile hooks under `apps/mobile/lib/hooks/`. Each owns one state
  machine. Don't pass dispatch functions across hook boundaries.
- All design tokens via `useTheme()`; never hardcode colors, spacing,
  or radii. Two type weights only: `'400'` and `'500'`.
- Migration numbering is sequential; latest is `0012`.

## What to ask Lloyd if you're picking this up

- **"Did the downscale fix work?"** First question. The dogfood branch
  still needs one phone retest before try-on can be called done. See
  **Branch State** above.
- **"Should we merge `feat/tryon-dogfood-fixes` before moving on?"**
  The work is bisectable into loop fix / cap bump / instrumentation +
  downscale, but it now lives on one branch.
- "Which screen are we walking through next?" (Closet is the natural
  next stop after Today + selfies + try-on are all working — assuming
  try-on is finally working.)
- "Any reported issues from dogfooding the try-on?" (Output quality is
  the open question — face fidelity, garment fidelity, hand glitches.)
- "Has the supabase project URL changed?" (Hosted Tokyo project as of
  this writing; if the URL flips, `services/api/.env` and
  `apps/mobile/.env` both need an update.)
- "Any new third-party keys?" (Replicate is in
  `services/image-worker/.env`. `OPENWEATHER_API_KEY` now enables real
  weather in `services/api/.env`; without it `/today` falls back to the
  local stub. Anthropic for Stella will land when the Stella one-shot
  does.)

## Note for non-Claude agents

This doc is model-agnostic markdown. If you're picking it up in
codex, Cursor, or anywhere else, the same instructions apply. The
`[tryon <id>]` step logs and the `useMemo` Stack.Screen pattern are
non-obvious project conventions that came out of dogfooding — don't
strip them as "cleanup" without reading the gotchas above.
