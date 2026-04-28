# Mei — design changeset 02

> **Status: PROPOSED — sign off before implementation.** This doc describes a stack-level migration that hasn't shipped yet. After it's approved, `SPEC.md` §3.1, §6, §7.3, §9, §12 get the surgical edits that make it real, and `docs/feature-breakdown.md` is rewritten for the new Wave 2.

## TL;DR

Swap the data + auth + storage layer from AWS-native (DynamoDB + Cognito + S3 + CloudFront + KMS) to **Supabase** (Postgres + Auth + Storage + Realtime + Row-Level Security).

Keep the Expo frontend as is. Keep Anthropic, Replicate, Expo Push, PostHog, Sentry. Move Stella's streaming Lambda to a small always-on Node container on **Render** (or Fly.io). Image-worker and notifier stay on AWS Lambda for batch/async.

## Why

Two reasons dominate.

### 1. The data model is relational

`SPEC.md §6` describes six many-to-many or one-to-many relationships in the core schema:

- Users ↔ ClosetItems
- ClosetItems ↔ Combinations
- Users ↔ Friendships
- OOTDPosts ↔ Reactions
- Hangouts ↔ HangoutMembers ↔ Combinations
- ChatThreads ↔ Messages, ChatThreads ↔ Participants

DynamoDB single-table can model these. It just makes us bake every access pattern into the PK/SK at write time, with a backfill every time we discover a new one. The spec already flags the breaking point: **`§6.1` says "fanout-on-read… revisit if friend graphs exceed ~200 per user."** That ceiling exists because DynamoDB cannot do `JOIN ootd ON friendships.friend_id … ORDER BY created_at LIMIT 50`. In Postgres that's one query.

### 2. Row-Level Security replaces ~30% of the handler code we'd otherwise write

`SPEC.md §12` is dense with cross-user privacy rules. Each one is currently destined to become a function call inside every handler that touches the data. With Postgres RLS each rule becomes one policy on the table; the database itself enforces it for every reader (Lambda, edge function, realtime subscriber).

Concrete examples from §12 → RLS form:

| §12 rule | Becomes |
|---|---|
| 12.1: selfies never accessible to other users | `CREATE POLICY selfies_owner_only ON selfies FOR SELECT USING (user_id = auth.uid())` |
| 12.2: closet thumbnails visible only to friends | `CREATE POLICY closet_friends_only ON closet_items FOR SELECT USING (user_id = auth.uid() OR is_friend(auth.uid(), user_id))` |
| 12.3: OOTD visibility narrowable not expandable | a Postgres trigger + a `visibility` enum check |
| 12.5: discoverable users surface in search | `CREATE POLICY users_discoverable ON users FOR SELECT USING (discoverable = true OR auth.uid() = user_id OR is_friend(auth.uid(), user_id))` |
| 12.7: closet thumbnails require friendship check on every cross-user read | one RLS policy on the storage bucket — no more signed CloudFront URLs |

This is a generational improvement in safety for an app with this many cross-user reads.

### Other wins

- **Realtime chat for free.** §7.3's "WebSocket via API Gateway WS API" is a non-trivial chunk of infra. Supabase Realtime is Postgres-change subscriptions natively. `subscribe('messages WHERE thread_id = X')` from the client. No WebSocket server to write.
- **Cognito → Supabase Auth.** Better DX, cleaner Apple/Google integration, native RLS coupling.
- **Schema evolution.** Postgres has 30 years of DBA tooling. DynamoDB schema changes are a backfill project.

## What's changing

### Tech stack table (§3.1)

| Layer | Before | After |
|---|---|---|
| Database | DynamoDB single-table | **Postgres (Supabase)** |
| Auth | AWS Cognito | **Supabase Auth** |
| Object storage | S3 + CloudFront | **Supabase Storage** (S3-compatible + CDN + RLS-aware) |
| Encryption | KMS for selfies | Platform encryption + RLS for selfies |
| Realtime | API Gateway WS API (planned) | **Supabase Realtime** |
| Stella streaming | Lambda + API Gateway streaming | **Always-on Node container on Render/Fly.io** |
| CRUD endpoints | Lambda + API Gateway | Supabase Edge Functions OR same Render container |
| Image-worker | Lambda + S3 events | **Lambda + Storage webhooks** (no change in shape) |
| Push notifier | Lambda + SQS | **Lambda + Supabase Realtime DB triggers** OR pg_cron |
| IaC | AWS CDK | **Supabase CLI migrations** + minimal Terraform/Pulumi for the Lambdas + Render |

### What stays exactly the same

- Mobile app (Expo + RN + TS + expo-router + NativeWind)
- TanStack Query + Zustand + MMKV
- Anthropic Claude (Sonnet) for Stella
- Replicate / fal.ai for image cleanup + try-on
- Expo Push for notifications
- PostHog + Sentry
- The whole `@mei/types` package — Zod schemas were always provider-agnostic
- The whole `@mei/ui` package
- The mock-server (`services/mock-server`) — still serves the contracts

### What gets archived (not deleted)

- `infra/lib/stacks/data-stack.ts` — the CDK stack we just shipped. Move to `infra/_archive/aws-cdk/` so it's there if we ever pivot back to all-AWS, but it doesn't deploy.
- `services/api/src/lib/{ddb,s3,cognito}.ts` — replaced by `supabase.ts` client wrapper. Archived.
- DDB key patterns in `services/stylist/src/store/conversationStore.ts` — replaced by Postgres rows.

## What did NOT change in the product

- Every feature in `SPEC.md` §1, §2, §10, §11 still ships.
- Every API route in `SPEC.md §7` still exists with the same contract — only the implementation behind it changes.
- Every privacy rule in §12 still holds — they get *better* because RLS removes the failure mode where a buggy handler leaks data.
- `tokens.ts`, `mockup.html`, design system: unchanged.

## Spec edits required (post-approval)

| `SPEC.md` section | Edit |
|---|---|
| §3.1 (tech stack table) | Replace DDB/Cognito/S3/CloudFront/KMS rows with Supabase rows. Add Render/Fly row for Stella. Drop SQS row. |
| §3.3 ("Why DynamoDB single-table") | Replace with §3.3 "Why Postgres + RLS" — short rationale referencing §12. |
| §6 (data model) | Rewrite §6.1 from DDB key patterns to a Postgres schema (ERD + DDL sketch). §6.2 TS interfaces stay; add the SQL DDL alongside. §6.3 S3 layout becomes Supabase Storage bucket layout. |
| §7.3 (realtime) | Replace "WebSocket via API Gateway WS API" with "Supabase Realtime channels". |
| §9 (image pipeline) | "S3 + CloudFront" → "Supabase Storage + RLS". Selfies stay private via RLS instead of SSE-KMS. |
| §12 (privacy) | Each rule annotated with the RLS policy name that enforces it. |
| §13.1 (build plan) | Replace the AWS-specific bullets with Supabase + Render bullets. Wave-1 frontend bullets unchanged. |
| §14 (open questions) | Add OQ-9 "Render vs Fly.io for Stella container" (defaulting to Render). Add OQ-10 "Supabase region — Singapore (`ap-southeast-1`) once GA, else Tokyo (`ap-northeast-1`) for SG users". |

## What ships in code (new feature breakdown)

The current `docs/feature-breakdown.md` Wave 2 list dies. Replacement:

### Wave 2a — backend platform (independent, can fan out)

- `feat/supabase-schema` — Postgres tables + indexes + enums + RLS policies. Migration files in `supabase/migrations/`. Mirrors `SPEC.md §6.2` entities.
- `feat/supabase-auth` — Auth provider config (email + Apple + Google) + session helpers in mobile and api.
- `feat/supabase-storage` — Bucket setup (`closet-raw`, `closet-tuned`, `selfies`, `ootd`) + RLS policies + signed-URL helpers.
- `feat/supabase-types-gen` — Wire `supabase gen types typescript` into a script; emit to `packages/types/src/db.ts`. Schemas stay in Zod; types augment with DB row types.

### Wave 2b — services rewired (depends on 2a)

- `feat/api-supabase-client` — Replace `services/api/src/lib/{ddb,s3,cognito}.ts` with `supabase.ts`. Auth middleware verifies Supabase JWT instead of Cognito JWT.
- `feat/stella-on-render` — Move `services/stylist` to a Render web service (Dockerfile, healthcheck, env via Render dashboard). Persistence shifts from DDB to Postgres `stella_messages` table.
- `feat/cognito-auth` becomes `feat/supabase-auth-routes` — `/auth/*` proxies to Supabase Auth (or just direct client SDK use).

### Wave 2c — business endpoints (depends on 2b)

Same list as before but DDB-free:
- `feat/closet-api`, `feat/today-api`, `feat/stella-api` (now hits the Render service), `feat/ootd-api`, `feat/friends-api`, `feat/chat-api-dms`, `feat/push-notifications`.

### Wave 2d — async/edge (parallel with 2c)

- `feat/image-worker` — Lambda triggered by Supabase Storage webhook (or polled — webhooks are the right form once they're in GA on your tier). Calls Replicate, writes back to Storage.
- `feat/notifier` — Lambda triggered by a Supabase Realtime channel or pg_notify on inserts to `notifications` table. Sends Expo Push.

## Cost picture (rough, small scale)

| Component | AWS plan | Supabase plan |
|---|---|---|
| Database + auth + storage | DDB on-demand + Cognito + S3 + CloudFront — ~$30–60/mo at low DAU | Supabase Pro $25/mo (8GB DB, 100GB storage) |
| Stella streaming | Lambda streaming, low-volume — ~$5/mo | Render Starter $7/mo always-on, no cold starts |
| Image worker + notifier | Lambda — ~$1/mo | Same |
| **Total** | ~$35–65/mo | ~$32/mo |

Comparable. Bigger savings come from operational overhead (no Cognito UX bugs, no GSI design sessions, no signed-URL plumbing).

## Implementation notes for Claude Code (post-approval)

After this changeset is signed off:

1. Spawn `feat/supabase-schema` first — solo, since 2b/2c/2d all depend on it.
2. Update SPEC.md sections per the table above in the same branch.
3. Once it lands, fan out 2a (auth, storage, types-gen) in parallel.
4. Then 2b, then 2c+2d in parallel.

Keep the AWS CDK code in `infra/_archive/` so it's there if we ever swing back. Never deleted.

Local dev story: `supabase start` brings up Postgres + Auth + Storage + Studio in Docker, identical to prod modulo region. The mock-server stays as the dev tool that doesn't need Docker.

## What did NOT make this changeset

Things the user might ask about that I've deliberately not changed:

- **Mobile stack.** Expo + RN is right. Don't touch.
- **State libraries.** TanStack Query talks to Supabase fine.
- **NativeWind.** Independent of backend.
- **Stella's tools (`SPEC.md §8.3`).** Same seven tools. The bodies just hit Postgres instead of DDB.
- **The Anthropic decision.** Sonnet is still the right model.

## Test checklist (post-implementation)

- [ ] `supabase start` brings up local stack; mobile app can sign up + sign in.
- [ ] Closet RLS: user A cannot SELECT user B's closet items unless friends.
- [ ] OOTD RLS: PUBLIC posts visible to anyone authenticated; FRIENDS posts visible to friends only; GROUP posts visible only to hangout members; DIRECT posts visible only to recipients.
- [ ] Selfie RLS: bucket SELECT denied to non-owners (no signed-URL workaround needed).
- [ ] Friend feed: latest 50 OOTDs from friends as a single SQL query, not fanout-on-read.
- [ ] Chat realtime: posting a message in thread X delivers within 1s to all participants subscribed.
- [ ] Stella container on Render: cold start ≤ 100ms; first token ≤ 800ms.
- [ ] Image worker still triggered on closet upload.
- [ ] Push notifications still fire for friend req / OOTD react / daily Today.

## Files updated by this changeset (after approval)

- `SPEC.md` — surgical edits per the table above.
- `docs/feature-breakdown.md` — rewritten for new Wave 2.
- `infra/_archive/aws-cdk/` — new dir, holds the old CDK stack.
- `supabase/` — new top-level dir, schema migrations + seed.
- `services/api/src/lib/supabase.ts` — new client wrapper (replaces ddb/s3/cognito).
- `services/stylist/Dockerfile` — for Render deploy.
- `apps/mobile/lib/supabase.ts` — client SDK setup.

`tokens.ts`, `mockup.html`, `@mei/types` Zod schemas — unchanged.

## Sign-off

This changeset is reversible while no real data is in production. Once the first user signs up against Supabase, switching back is a real migration. Sign off before merging Wave 2a.
