# P0 feature breakdown

Source of truth: `SPEC.md §13.1`. Every feature listed here maps to one
`feat/<name>` branch and one PR. A "wave" is a set of features safe to
parallelize because they don't share files.

For each feature: **goal → spec ref → in-scope files → acceptance → non-goals**.

---

## Wave 1 — UI primitives & screen shells (no backend dependency)

These all touch `packages/ui` or `apps/mobile/app/<screen>` independently.
Safe to run in parallel.

### `feat/ui-primitives`

**Goal.** Ship the remaining design-system primitives so screen work can use them.
**Spec.** §5.5.
**In-scope.** `packages/ui/src/components/{Card,Button,Chip,Avatar,Thumb,OutfitCard,Bubble,MetricCell,SettingRow,SectionHeader}.tsx`, `packages/ui/src/index.ts`.
**Acceptance.** All listed components export, typecheck clean, props match §5.5 table. No backend calls.
**Non-goals.** Don't change theme tokens. Don't add screens.

### `feat/today-screen`

**Goal.** Build the Today screen shell with weather/calendar/today's-pick/community sections — all populated from in-file mock data for now.
**Spec.** §10.1.
**In-scope.** `apps/mobile/app/(tabs)/today.tsx` and any local `apps/mobile/components/today/*`.
**Acceptance.** Screen renders all sections from §10.1, matches `mockup.html → 01 · TODAY`, all values from theme.
**Non-goals.** No real `/today` API call. No try-on. No Stella suggestion logic.

### `feat/closet-screen`

**Goal.** Closet grid + Combinations toggle + filter chips + processing banner + FAB.
**Spec.** §10.2.
**In-scope.** `apps/mobile/app/(tabs)/closet.tsx`, mock data file.
**Acceptance.** Filter chips switch grid. Combinations renders 2-up `OutfitCard`. Empty + populated states. Matches mockup `02 · CLOSET · COMBINATIONS`.
**Non-goals.** No upload. No item detail.

### `feat/stella-chat`

**Goal.** Stella modal chat UI: bubbles, quick-reply chips, composer.
**Spec.** §10.5.
**In-scope.** `apps/mobile/app/stella.tsx`, local components.
**Acceptance.** Renders inbound/outbound bubbles, quick-reply strip, composer. Matches mockup `STELLA · AI STYLIST`. Mock conversation in-file.
**Non-goals.** No SSE / no Anthropic call.

### `feat/chats-inbox`

**Goal.** Chats inbox sections: Pinned (Stella), Groups, Direct.
**Spec.** §10.6.
**In-scope.** `apps/mobile/app/(tabs)/chats.tsx`.
**Acceptance.** Renders three sections with mock threads. Tapping a row pushes to a `chat/[id].tsx` placeholder.
**Non-goals.** No real chat. No closet drawer (P1).

### `feat/you-profile`

**Goal.** You/profile screen with stats + settings list.
**Spec.** §10.11.
**In-scope.** `apps/mobile/app/(tabs)/you.tsx`, `apps/mobile/components/you/*`.
**Acceptance.** Matches mockup `YOU`. Settings rows are visual-only (no real updates).
**Non-goals.** No PATCH /me wiring.

---

## Wave 2 — Backend foundations (depends on infra; sequence required)

### `feat/cdk-data-stack`

**Goal.** AWS CDK stack for DynamoDB single-table + S3 buckets + Cognito user pool.
**Spec.** §6, §9.4, §4.
**In-scope.** `infra/lib/stacks/data-stack.ts`, `infra/bin/mei.ts`.
**Acceptance.** `cdk synth` produces a valid template; tables/buckets/pool exist with the correct keys.
**Non-goals.** Don't deploy. Don't add API Gateway here.

### `feat/api-skeleton`

**Goal.** `services/api` Fastify-style Lambda handler skeleton + DDB/S3/auth lib.
**Spec.** §7.1.
**In-scope.** `services/api/src/lib/{ddb,s3,auth}.ts`, `services/api/src/handlers/_health.ts`, `services/api/package.json` deps.
**Acceptance.** `pnpm --filter @mei/api typecheck` green. Local invoke of `_health` returns `{ ok: true }`.
**Non-goals.** No real endpoints yet.

### `feat/cognito-auth`

**Goal.** `/auth/*` and `/me` endpoints. Depends on `feat/cdk-data-stack` + `feat/api-skeleton`.
**Spec.** §7 (Auth & profile).
**Acceptance.** Signup creates User row in DDB. Login returns tokens. /me returns current user.
**Non-goals.** No client wiring.

### `feat/closet-api`

**Goal.** `/closet/items/*` + `/closet/combinations/*`. Depends on auth.
**Spec.** §7 (Closet, Combinations).
**Acceptance.** All endpoints from §7 implemented. Presigned upload PUT URLs. Stub processor (Claude vision integration deferred to its own branch).
**Non-goals.** No real image cleanup.

### `feat/today-api`

**Goal.** `/today` aggregator: weather + calendar + one-shot Stella for daily pick.
**Spec.** §7 (Today), §8.5.

### `feat/stella-api`

**Goal.** `/stella/conversations/*` with full toolset, SSE streaming.
**Spec.** §7 (Stella), §8.

### `feat/ootd-api`

**Goal.** OOTD create + feed + reactions, with **fallback OutfitCard** as P0 share image.
**Spec.** §7 (OOTD), §9.3 (fallback).

### `feat/friends-api`

**Goal.** Friend requests, accept, list, search-by-username.
**Spec.** §7 (Friends).

### `feat/chat-api-dms`

**Goal.** `/chat/threads/*` for DMs only.
**Spec.** §7 (Chat).

### `feat/push-notifications`

**Goal.** Expo Push for friend request, OOTD reaction, daily Today reminder.
**Spec.** §7.3.

---

## Wave 3 — Frontend ↔ Backend wiring

After Wave 1 and Wave 2 land, wire each screen to its real endpoint. Each
wiring is its own branch:

- `feat/wire-today` · `feat/wire-closet` · `feat/wire-stella` · `feat/wire-ootd-share` · `feat/wire-friends` · `feat/wire-chats`

---

## Excluded from P0 (per §13.1)

- Hangouts (P1) · "What others are wearing" (P1) · Try-on photo generation (P1) · Closet drawer in chat (P1) · Coordinate from feed (P1) · Fashion now (P2).

These get their own breakdown when P1 starts.
