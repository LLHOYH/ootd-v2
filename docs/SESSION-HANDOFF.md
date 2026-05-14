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
> **Last updated:** after PR #76 merged.

---

## TL;DR

Mei is a digital wardrobe + AI stylist app. Lloyd is the founder and
sole dogfooder. The app is being walked screen-by-screen with bugs and
missing features filed and fixed in tight PR cycles. Today, the
**Today tab** and **selfie + try-on flow** are functional end-to-end.
Closet / Friends / Chats / You tabs have not been audited yet.

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
- **External AI:** Replicate (IDM-VTON for try-on, eventually rembg
  for closet) and Anthropic Claude (Stella conversations).
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
- **Weather strip** — backend reads `users.city` and falls back to
  Singapore. **Geolocation is not wired** — strip shows whatever
  `users.city` says. Filed as a chip.
- **Today's Pick** card — server picks the user's most recent
  combination (Stella is not wired yet). Real item photos render via
  `useClosetItemMap`. Heart toggles local state only (persistence
  filed as a chip). "Try another" hits `/today/another-pick` with the
  seen-combo exclusion list and animates the swap. "Wear this on me"
  opens **/tryon** (not `/share` anymore).
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
- Backend: `POST /tryon` accepts `{comboId, selfieId?}`. Resolves the
  selfie (caller-supplied or most-recent), picks the first wearable
  item from the combination (DRESS → TOP → OUTERWEAR → BOTTOM), checks
  for a cached READY row, inserts a PENDING row, fires the
  image-worker synchronously, returns the final row.
- `services/image-worker/src/providers/tryon.ts` wraps Replicate
  IDM-VTON, pinned to model version `c871bb9b...`.
- Cost: ~$0.04 per generation. Rate-limited at the DB level
  (`tryon_generations_daily_cap`): 10/user/day.
- Mobile preview screen `/tryon.tsx`: full-screen image, three
  actions (Share with friends → `/share`, Different selfie → in-screen
  picker modal, Done → back). Error handling per response code:
  `NO_SELFIE` → CTA to `/selfies`, `RATE_LIMITED` → surface the cap,
  anything else → Try again button.

### Share flow (SPEC §10.10 form)

- `/share` is the existing caption + visibility + post-creation
  modal. Reached from the try-on preview's "Share with friends"
  button. Unchanged structurally; PR #71 fixed the infinite render
  loop (`<Stack.Screen options={{...}} />` literal rebuilt every
  render).

## What does NOT ship yet

- **Closet tab** — exists, photos render real, but no QA pass yet.
- **Friends tab** — same.
- **Chats tab** — same.
- **You tab** — same.
- **Weather geolocation** — chip queued.
- **Heart persistence** — chip queued; currently local React state.
- **Calendar events strip** — handler returns empty array; OS calendar
  sync not wired.
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
   CLI is logged in). Last applied: `0008_tryon_generations.sql`.

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

1. **Detect device location for weather strip.** Currently
   `users.city`. Need `expo-location` + lat/lon contract change +
   real weather provider integration (OpenWeatherMap is the documented
   choice). Bigger refactor.
2. **Persist saved-look likes to backend.** Heart toggle is local
   React state. Needs `/me/likes` endpoint + RLS-guarded table. PR #63
   left the parent owning the state so swapping in a mutation hook
   later doesn't change component shapes.
3. **Pass try-on image to /share preview.** Currently /share still
   shows the outfit composite. v2 polish: also pass the generated
   `imageUrl` from /tryon → /share so the share preview shows the
   try-on photo.

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
- Migration numbering is sequential; latest is `0008`.

## What to ask Lloyd if you're picking this up

- "Which screen are we walking through next?" (Closet is the natural
  next stop after Today + selfies + try-on are all working.)
- "Any reported issues from dogfooding the try-on?" (Output quality is
  the open question — face fidelity, garment fidelity, hand glitches.)
- "Has the supabase project URL changed?" (Hosted Tokyo project as of
  this writing; if the URL flips, `services/api/.env` and
  `apps/mobile/.env` both need an update.)
- "Any new third-party keys?" (Replicate is in
  `services/image-worker/.env`. Anthropic for Stella will land when
  the Stella one-shot does. OpenWeatherMap if weather geolocation
  ships.)
