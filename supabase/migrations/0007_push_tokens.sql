-- Mei — push tokens table.
--
-- One row per (user, token). Tokens are the opaque strings Expo Push
-- service hands the mobile client at runtime; we forward them verbatim
-- when fanning out a push. A user can have multiple tokens (one per
-- device). Replacing a token deletes the old one (UNIQUE on token).

------------------------------------------------------------------------------
-- 1. Table
------------------------------------------------------------------------------

create type public.push_platform as enum ('ios', 'android', 'web');

create table public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(user_id) on delete cascade,
  token         text not null,
  platform      public.push_platform not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Tokens are per-device-install globally unique. If the same token shows
  -- up under a new user (e.g. user signed out of one account and into
  -- another on the same device), the new INSERT replaces the prior owner.
  unique (token)
);

create index push_tokens_user_idx on public.push_tokens (user_id);

------------------------------------------------------------------------------
-- 2. RLS
--
-- Users own their tokens. Each user can read / insert / update / delete
-- their own rows. The notifier service uses the service-role key to fan
-- out, so it bypasses RLS entirely (consistent with image-worker, etc.).
------------------------------------------------------------------------------

alter table public.push_tokens enable row level security;

create policy push_tokens_select_self
  on public.push_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

create policy push_tokens_insert_self
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy push_tokens_update_self
  on public.push_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_tokens_delete_self
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());
