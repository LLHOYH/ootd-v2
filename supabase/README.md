# supabase/

Postgres schema, RLS policies, Storage bucket setup, and local-dev seed for
Mei. This directory is the only contract between the database and the app —
every other backend feature branch (auth, types-gen, API client, edge
functions) consumes what's here.

## Layout

```
config.toml                       Project + local-dev port pins (Tokyo region note)
seed.sql                          Local-dev fixtures (Sophia + 8 friends + 15 items + ...)
migrations/
├── 0001_init_schema.sql          Tables + enums + indexes + helper functions + triggers
├── 0002_rls_policies.sql         RLS enabled on every public.* table; policies per SPEC.md §12
└── 0003_storage_buckets.sql      `closet-raw` / `closet-tuned` / `selfies` / `ootd` + bucket RLS
```

## Local development

```bash
# One-time
brew install supabase/tap/supabase

# From repo root
supabase start                   # spins up Postgres + Auth + Storage + Studio in Docker
supabase db reset                # apply all migrations + run seed.sql (destructive)
supabase status                  # show ports + dashboard URL + service-role key
```

Default local ports (see `config.toml`):

| Service       | Port  |
|---------------|-------|
| API (PostgREST + Auth) | 54321 |
| Postgres      | 54322 |
| Studio        | 54323 |
| Inbucket (mail) | 54324 |

### Logging in as Sophia

`seed.sql` creates an `auth.users` row for Sophia with:

- `user_id` = `00000001-0000-0000-0000-000000000001`
- email     = `sophia@example.com`
- password  = `password123`

The seed also creates the eight other fixture users
(`meili`/`serena`/`jia`/`amelia`/`anna`/`lou`/`kimi`/`navi`) with the same
password. Their UUIDs follow the scheme documented at the top of `seed.sql`:

```
users           00000001-0000-0000-0000-0000000000XX (X = 1..9)
closet_items    00000002-0000-0000-0000-0000000000XX
combinations    00000003-...
selfies         00000004-...
ootd_posts      00000005-...
hangouts        00000006-...
chat_threads    00000007-...
chat_messages   00000008-...
stella_convos   00000009-...
stella_messages 0000000a-...
```

## Applying to a hosted project

```bash
supabase link --project-ref <ref>     # link this dir to your hosted project
supabase db push                      # apply pending migrations
```

`seed.sql` is **not** run against hosted projects by `db push`. Hosted users
should be created via Supabase Auth (email/Apple/Google) rather than
hand-crafted `auth.users` rows.

## Region

Hosted target is **`ap-northeast-1` (Tokyo)** per `SPEC.md §13.1` — closest
GA region for Singapore users until `ap-southeast-1` (Singapore) reaches GA.
Pinned in `config.toml` only as a comment; the actual hosted region is set
at project creation time in the Supabase dashboard. See `SPEC.md §14`
OQ-10 for the eventual move.

## Tier notes

- **`pg_cron`** is referenced by `0001_init_schema.sql`'s commented-out
  hangout-expiry job (`SPEC.md §12.4`). The extension itself, the
  `cron.schedule(...)` call, and the trigger that flips `hangouts.status`
  to `EXPIRED` 12h after `starts_at` are all **commented out** because
  `pg_cron` requires Supabase Pro tier. Ship-time decision — uncomment
  when on Pro.
- **`closet-tuned` and `ootd` buckets** are marked `public = true` so the
  Supabase CDN can cache them. Access is still gated by RLS on
  `storage.objects` (the "public" flag controls only the *default* of
  whether unauthenticated path access works without RLS). See `SPEC.md §9.4`
  — **Storage RLS replaces the signed-URL plumbing** the AWS-stack version
  required.

## Privacy contract

Every privacy rule in `SPEC.md §12` is realised as one or more named
policies in `migrations/0002_rls_policies.sql`. Names match the spec
exactly where one was given:

| §12 rule | Policy |
|---|---|
| 12.1 selfies never accessible to other users | `selfies_owner_only` (table + storage) |
| 12.2 closet items: friends via OOTD only | `closet_items_owner_all`, `closet_items_via_ootd` |
| 12.3 OOTD visibility ladder | `ootd_posts_visibility` + `ootd_posts_visibility_only_narrows` trigger |
| 12.4 hangout members visible to co-members | `hangout_members_visible_to_members` |
| 12.5 discoverability | `users_select_visible` |
| 12.7 closet thumbnails require friendship | `closet_tuned_owner_or_friend` (storage) |

The OOTD bucket policy (`ootd_visibility_scoped`) joins `storage.objects`
back to `public.ootd_posts` by storage key and applies the same visibility
predicate as `ootd_posts_visibility`, so an unauthorised reader gets a
404 from Storage even with a direct URL.

## What this branch does NOT do

- No app code (mobile, services, packages) — that's `feat/api-supabase-client`,
  `feat/supabase-auth`, etc.
- No `supabase gen types` integration — that's `feat/supabase-types-gen`.
- No edge functions — that's the per-feature API branches under Wave 2c.
- No image-worker or notifier — Wave 2d.
