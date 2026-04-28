# P0 feature breakdown

Source of truth: `SPEC.md §13.1`. Every feature listed here maps to one
`feat/<name>` branch and one PR. A "wave" is a set of features safe to
parallelize because they don't share files.

For each feature: **goal → spec ref → in-scope files → acceptance → non-goals**.

> **History.** Wave 1 (frontend skeleton) and the original "Pass 1 backend"
> (CDK stack, API skeleton, mock-server, Stella shell) shipped against the
> AWS-native plan. `docs/CHANGES-02.md` then migrated the platform to
> Supabase + Render. The breakdown below is the post-changeset plan; the
> already-shipped frontend wave stays as-is.

---

## Wave 1 — UI primitives & screen shells (shipped)

Already on main. Listed for completeness.

- ✅ `feat/ui-primitives` — `@mei/ui` design-system components
- ✅ `feat/today-screen`, `feat/closet-screen`, `feat/stella-chat`, `feat/chats-inbox`, `feat/you-profile`
- ✅ Nav restructure (`docs/CHANGES.md` changeset 01)
- ✅ Tab-bar persistence on chat detail

---

## Wave 2a — backend platform foundations

Parallel-safe after `feat/supabase-schema` lands solo. The schema is the
shared dependency for everything in 2b/2c/2d.

### `feat/supabase-schema` (solo first)

**Goal.** Postgres schema + RLS policies + Storage buckets, all expressed as Supabase CLI migrations.
**Spec.** §6.1, §6.3, §12.
**In-scope.** `supabase/migrations/0001_init_schema.sql`, `supabase/migrations/0002_rls_policies.sql`, `supabase/migrations/0003_storage_buckets.sql`, `supabase/seed.sql`, `supabase/config.toml`.
**Acceptance.** `supabase db reset` (local) applies cleanly. RLS smoke: a non-friend cannot `select` another user's `closet_items`. The four buckets exist with correct policies. Seed produces the same `u_sophia` fixture the mock-server uses.
**Non-goals.** No app code changes. No deploy to hosted Supabase yet — that comes in `feat/supabase-deploy-staging`.

### `feat/supabase-auth` (parallel after schema)

**Goal.** Wire Supabase Auth on mobile + the Render service.
**Spec.** §3.1, §7 Auth & profile, §12.5.
**In-scope.** `apps/mobile/lib/supabase.ts` (client), `apps/mobile/app/_layout.tsx` (session provider), the auth-aware fetch helper, replacement for the `mock_<userId>` token convention.
**Acceptance.** Sign up + sign in + sign out work locally against `supabase start`. JWT carries through to the API; `auth.uid()` returns the right user.
**Non-goals.** Apple/Google OAuth client IDs (those need real credentials — wire later). Onboarding flow.

### `feat/supabase-storage` (parallel after schema)

**Goal.** Storage helpers in the API/Render code + the mobile app for uploading + reading bucket objects with RLS.
**Spec.** §6.3, §9, §12.7.
**In-scope.** `services/api/src/lib/storage.ts`, `apps/mobile/lib/storage.ts`, types for storage keys.
**Acceptance.** Mobile can request a signed-upload URL, PUT a closet photo, the row is created, RLS lets the owner SELECT it back, a non-friend cannot.
**Non-goals.** Image-worker pipeline (`feat/image-worker` later).

### `feat/supabase-types-gen` (parallel after schema)

**Goal.** Run `supabase gen types typescript` and emit a `db.ts` into `@mei/types`. CI step that fails the build if the generated types drift from migrations.
**Spec.** §6.2.
**In-scope.** `packages/types/scripts/gen-db-types.sh`, `packages/types/src/db.ts` (generated), CI step in `.github/workflows/ci.yml`.
**Acceptance.** Generated types compile alongside the existing Zod entity schemas. Drift check works.
**Non-goals.** Removing the existing Zod entity schemas — they stay as the runtime-validation layer.

---

## Wave 2b — services rewired (depends on 2a)

### `feat/api-supabase-client`

**Goal.** Replace the AWS-flavoured library wrappers in `services/api/src/lib/` with a Supabase client wrapper.
**Spec.** §3.1, §7.1.
**In-scope.** Move `services/api/src/lib/{ddb,s3,cognito}.ts` → `infra/_archive/aws-cdk/lib/`. Add `services/api/src/lib/supabase.ts`. Update `services/api/src/middleware/auth.ts` to verify Supabase JWT.
**Acceptance.** `_health` still works. `pnpm --filter @mei/api typecheck` green.
**Non-goals.** Business endpoints — Wave 2c.

### `feat/stella-on-render`

**Goal.** Move `services/stylist` from AWS Lambda streaming to a Render-deployable Node container. Replace the DDB conversation store with Postgres.
**Spec.** §3.1, §6.1 (`stella_conversations`, `stella_messages`), §8.
**In-scope.** `services/stylist/Dockerfile`, `services/stylist/src/index.ts` (HTTP server), `services/stylist/src/store/conversationStore.ts` (Postgres-backed). Archive the Lambda streamifyResponse handler.
**Acceptance.** `docker build` succeeds. `pnpm --filter @mei/stylist local` still drives the MockProvider end-to-end. Smoke test against `supabase start` writes/reads conversation rows.
**Non-goals.** Real Render deploy (waits on the user's Render account).

---

## Wave 2c — business endpoints (parallel after 2b)

Same scope as the original Wave 2 list, now backed by Postgres + Storage.

- `feat/closet-api` — `/closet/items/*` + `/closet/combinations/*`
- `feat/today-api` — `/today` + `/today/another-pick` + `/today/community-looks`
- `feat/stella-api` — wires the Render container into the API surface (proxies POST /stella/conversations/{id}/messages)
- `feat/ootd-api` — `/ootd/*` create + feed + reactions
- `feat/friends-api` — `/friends/*` request/accept/list/search
- `feat/chat-api-dms` — `/chat/threads/*` for DMs only; live updates via Realtime channel from the client

---

## Wave 2d — async / edge (parallel with 2c)

### `feat/image-worker`

**Goal.** AWS Lambda that consumes Supabase Storage webhooks, calls Claude vision + Replicate, writes back to Storage and updates the `closet_items` row.
**Spec.** §9.1.
**In-scope.** `services/image-worker/src/`, `infra/lambdas/image-worker/`.
**Acceptance.** Local invocation against `supabase start` + a fake webhook event produces a tuned + thumb image and updates the row.

### `feat/notifier`

**Goal.** AWS Lambda triggered by `pg_notify` for new `notifications` table inserts. Sends Expo Push.
**Spec.** §7.3, §13.1 push list.
**In-scope.** `services/notifier/src/`, a `notifications` table + trigger in `supabase/migrations/`, `infra/lambdas/notifier/`.
**Acceptance.** Inserting a `notifications` row results in an Expo Push call (mocked with a stub fetch in tests).

### `feat/supabase-deploy-staging`

**Goal.** Provision the staging Supabase project (`ap-northeast-1`) and run migrations against it. GitHub Actions step.
**Acceptance.** `main` branch pushes apply migrations to staging automatically.

---

## Wave 3 — frontend wiring (depends on 2c)

Replace per-screen mocks with real `fetch` calls against the API:

- `feat/wire-today` · `feat/wire-closet` · `feat/wire-stella` · `feat/wire-ootd-share` · `feat/wire-friends` · `feat/wire-chats`

Each wiring branch is small: drop the `mocks.ts` import, swap to TanStack Query hooks, error states, loading skeletons.

---

## Excluded from P0 (per `SPEC.md §13.1`)

- Hangouts (P1) · "What others are wearing" (P1) · Try-on photo generation (P1) · Closet drawer in chat (P1) · Coordinate from feed (P1) · Fashion now (P2).

These get their own breakdown when P1 starts.
