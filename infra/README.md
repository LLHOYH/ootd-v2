# @mei/infra

Mei's live infra. **Post `docs/CHANGES-02.md`** the platform moved from AWS-native (CDK + DDB + Cognito + S3 + CloudFront) to Supabase + Render, with a thin AWS Lambda surface for batch/async work. This package is the home for the still-needed AWS pieces.

## Layout

```
infra/
├── _archive/aws-cdk/      # the original AWS-native CDK stack (data-stack
│                           #   for DDB + S3 + Cognito + KMS). NOT deployed.
│                           #   Kept verbatim for reference and as the path
│                           #   back if we ever swing off Supabase.
├── lambdas/               # (coming in feat/image-worker, feat/notifier)
│                           # CLI / Pulumi config for the two AWS Lambdas:
│                           # image-worker (Storage webhook → Replicate)
│                           # notifier (pg_notify → Expo Push)
└── render/                # (coming in feat/stella-on-render)
                            # Render service config for services/stylist
```

## What lives where now

| Concern | Where |
|---|---|
| Database schema + RLS + Storage buckets | `supabase/migrations/` (top-level, not under `infra/`) |
| Auth | Supabase project (configured via `supabase/config.toml`) |
| API HTTP surface | `services/api` deployed alongside or as Edge Functions (see `feat/api-supabase-client`) |
| Stella long-lived runtime | Render service (`infra/render/`, `services/stylist/Dockerfile`) |
| Image cleanup async | AWS Lambda (`infra/lambdas/image-worker/`) |
| Push dispatch | AWS Lambda (`infra/lambdas/notifier/`) |
| CDN | Supabase Storage CDN (no separate CloudFront stack) |

## The archived CDK stack

The complete original CDK code (`MeiDataStack`) lives under `_archive/aws-cdk/`. You can still synth it for reference:

```bash
pnpm --filter @mei/infra synth:archive
pnpm --filter @mei/infra diff:archive
pnpm --filter @mei/infra typecheck:archive
```

These are not part of any deploy path. They exist so we never have to reconstruct the AWS-native plan from scratch if we later decide to revisit it.

## Why Supabase instead

See `docs/CHANGES-02.md` for the full rationale. TL;DR: Mei's data is highly relational (six many-to-many or one-to-many relationships in `SPEC.md §6`), the privacy rules in §12 collapse from per-handler code into RLS policies, and the friend-feed scale ceiling that DynamoDB single-table imposed (`§6.1` "revisit if friend graphs exceed ~200 per user") goes away.

## What's coming

Per `docs/feature-breakdown.md`:

- **Wave 2a** — `feat/supabase-schema`, `feat/supabase-auth`, `feat/supabase-storage`, `feat/supabase-types-gen`
- **Wave 2b** — `feat/api-supabase-client`, `feat/stella-on-render`
- **Wave 2c** — business endpoints
- **Wave 2d** — `feat/image-worker`, `feat/notifier`, `feat/supabase-deploy-staging`
