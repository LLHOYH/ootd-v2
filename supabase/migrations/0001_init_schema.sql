-- Mei — initial schema (SPEC.md §6.1 + §6.2)
--
-- This migration creates every public.* table, the enums backing each
-- closed-set column, indexes covering the access patterns in §6.1, and
-- the helper functions / triggers that downstream policies + features
-- rely on. RLS itself is enabled in 0002_rls_policies.sql; storage
-- buckets land in 0003_storage_buckets.sql.

------------------------------------------------------------------------------
-- 1. Extensions
------------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;
-- pg_cron drives the hangout auto-expire job described in §12.4. It requires
-- Supabase Pro tier; ship-time decision. Uncomment once the project is on Pro.
-- create extension if not exists pg_cron with schema extensions;

------------------------------------------------------------------------------
-- 2. Enums
--
-- Closed value sets get CREATE TYPE; columns where future drift is plausible
-- (gender) stay text + CHECK so we can add literals without a type-rewrite.
------------------------------------------------------------------------------

create type public.clothing_category    as enum ('DRESS','TOP','BOTTOM','OUTERWEAR','SHOE','BAG','ACCESSORY');
create type public.occasion             as enum ('CASUAL','WORK','DATE','BRUNCH','EVENING','WEDDING','WORKOUT','BEACH');
create type public.weather_tag          as enum ('HOT','WARM','MILD','COLD','RAIN');
create type public.combination_source   as enum ('STELLA','TODAY_PICK','CRAFTED','COORDINATED');
create type public.friend_request_status as enum ('PENDING','ACCEPTED','DECLINED','CANCELLED');
create type public.ootd_visibility      as enum ('PUBLIC','FRIENDS','GROUP','DIRECT');
create type public.hangout_status       as enum ('ACTIVE','EXPIRED','CANCELLED');
create type public.hangout_role         as enum ('OWNER','MEMBER');
create type public.hangout_invite_status as enum ('INVITED','JOINED','DECLINED');
create type public.chat_thread_type     as enum ('DIRECT','GROUP','HANGOUT','STELLA');
create type public.chat_message_kind    as enum ('TEXT','CLOSET_ITEM','COMBINATION','OOTD','IMAGE');
create type public.closet_item_status   as enum ('PROCESSING','READY','FAILED');
create type public.climate_profile      as enum ('TROPICAL','TEMPERATE','ARID','COLD');
create type public.stella_message_role  as enum ('USER','ASSISTANT');

------------------------------------------------------------------------------
-- 3. Tables
------------------------------------------------------------------------------

-- 3.1 users — 1:1 with auth.users; profile + privacy toggles.
create table public.users (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  username         text unique not null,
  display_name     text not null,
  avatar_url       text,
  gender           text check (gender in ('F','M','NB','PNS')),
  birth_year       int check (birth_year is null or (birth_year between 1900 and 2100)),
  country_code     text check (country_code is null or char_length(country_code) = 2),
  city             text,
  style_preferences text[] not null default '{}',
  climate_profile  public.climate_profile,
  discoverable     boolean not null default false,
  contributes_to_community_looks boolean not null default false,
  created_at       timestamptz not null default now(),
  last_active_at   timestamptz not null default now()
);

-- 3.2 closet_items — owned by users, photographed via the upload pipeline.
create table public.closet_items (
  item_id          uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(user_id) on delete cascade,
  category         public.clothing_category not null,
  name             text not null,
  description      text not null default '',
  colors           text[] not null default '{}',
  fabric_guess     text,
  occasion_tags    public.occasion[] not null default '{}',
  weather_tags     public.weather_tag[] not null default '{}',
  -- Storage paths, not URLs. Resolved against the bucket via storage.objects.
  -- Convention from §6.3: `{user_id}/{item_id}.{ext}` in each bucket.
  raw_storage_key  text,
  tuned_storage_key text,
  thumbnail_storage_key text,
  status           public.closet_item_status not null default 'PROCESSING',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index closet_items_user_idx
  on public.closet_items (user_id, category, created_at desc);

-- 3.3 combinations — saved outfits, 2-6 items each.
create table public.combinations (
  combo_id         uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(user_id) on delete cascade,
  name             text not null,
  occasion_tags    public.occasion[] not null default '{}',
  source           public.combination_source not null,
  created_at       timestamptz not null default now()
);
create index combinations_user_created_idx
  on public.combinations (user_id, created_at desc);

-- 3.4 combination_items — join. `position` orders thumbs in the OutfitCard.
create table public.combination_items (
  combo_id  uuid not null references public.combinations(combo_id) on delete cascade,
  item_id   uuid not null references public.closet_items(item_id) on delete cascade,
  position  int  not null,
  primary key (combo_id, item_id)
);
create index combination_items_item_idx on public.combination_items (item_id);

-- 3.5 selfies — owner-only, capped at 5 per user (§9.2).
create table public.selfies (
  selfie_id   uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(user_id) on delete cascade,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);
create index selfies_user_idx on public.selfies (user_id, uploaded_at desc);

-- 3.6 friendships — canonical (user_a < user_b) form. One row per pair.
create table public.friendships (
  user_a uuid not null references public.users(user_id) on delete cascade,
  user_b uuid not null references public.users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
-- Reverse direction lookup: given user_b, find their friend on the user_a side.
create index friendships_user_b_idx on public.friendships (user_b);

-- 3.7 friend_requests — outbound + inbound, one row per ordered pair.
create table public.friend_requests (
  from_user_id uuid not null references public.users(user_id) on delete cascade,
  to_user_id   uuid not null references public.users(user_id) on delete cascade,
  status       public.friend_request_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  primary key (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);
create index friend_requests_to_idx   on public.friend_requests (to_user_id, status);
create index friend_requests_from_idx on public.friend_requests (from_user_id, status);

-- 3.8 ootd_posts — visibility-scoped feed entries.
-- selfie_id is nullable + cascades on delete per §12.1 ("cascades to any
-- cached try-on outputs that used the selfie via on delete cascade").
create table public.ootd_posts (
  ootd_id      uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(user_id) on delete cascade,
  combo_id     uuid not null references public.combinations(combo_id) on delete restrict,
  selfie_id    uuid references public.selfies(selfie_id) on delete cascade,
  caption      text,
  location_name text,
  try_on_storage_key text,
  fallback_outfit_card_storage_key text,
  visibility   public.ootd_visibility not null,
  -- groupIds (hangout_id) when visibility = GROUP, userIds when DIRECT.
  visibility_targets uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index ootd_user_created_idx     on public.ootd_posts (user_id, created_at desc);
create index ootd_friends_feed_idx     on public.ootd_posts (visibility, created_at desc);

-- 3.9 ootd_reactions — one row per (ootd, user) reaction.
create table public.ootd_reactions (
  ootd_id    uuid not null references public.ootd_posts(ootd_id) on delete cascade,
  user_id    uuid not null references public.users(user_id) on delete cascade,
  type       text not null default '♡',
  created_at timestamptz not null default now(),
  primary key (ootd_id, user_id)
);

-- 3.10 hangouts — coordination groups, auto-expire per §12.4.
create table public.hangouts (
  hangout_id    uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(user_id) on delete cascade,
  name          text not null,
  starts_at     timestamptz not null,
  expires_at    timestamptz not null,
  location_name text,
  status        public.hangout_status not null default 'ACTIVE',
  created_at    timestamptz not null default now(),
  check (expires_at >= starts_at)
);
create index hangouts_status_expires_idx on public.hangouts (status, expires_at);

-- 3.11 hangout_members — membership + per-member shared combo.
create table public.hangout_members (
  hangout_id    uuid not null references public.hangouts(hangout_id) on delete cascade,
  user_id       uuid not null references public.users(user_id) on delete cascade,
  role          public.hangout_role not null default 'MEMBER',
  invite_status public.hangout_invite_status not null default 'INVITED',
  shared_combo_id uuid references public.combinations(combo_id) on delete set null,
  shared_at     timestamptz,
  joined_at     timestamptz not null default now(),
  primary key (hangout_id, user_id)
);
create index hangout_members_user_idx on public.hangout_members (user_id);

-- 3.12 chat_threads — DMs, groups, hangout rooms, the Stella pinned thread.
create table public.chat_threads (
  thread_id       uuid primary key default gen_random_uuid(),
  type            public.chat_thread_type not null,
  hangout_id      uuid references public.hangouts(hangout_id) on delete cascade,
  name            text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

-- 3.13 chat_thread_participants — per-user state on a thread.
create table public.chat_thread_participants (
  thread_id    uuid not null references public.chat_threads(thread_id) on delete cascade,
  user_id      uuid not null references public.users(user_id) on delete cascade,
  unread_count int  not null default 0,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create index chat_thread_participants_user_idx
  on public.chat_thread_participants (user_id);

-- 3.14 chat_messages — kind-tagged payloads. text required only for TEXT kind.
create table public.chat_messages (
  message_id   uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.chat_threads(thread_id) on delete cascade,
  sender_id    uuid not null references public.users(user_id) on delete cascade,
  kind         public.chat_message_kind not null,
  text         text,
  ref_id       text,
  created_at   timestamptz not null default now(),
  -- Match §6.2 ChatMessage: text only required for TEXT kind.
  check (kind <> 'TEXT' or text is not null)
);
create index chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

-- 3.15 stella_conversations — per-user assistant convo with a title.
create table public.stella_conversations (
  convo_id        uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(user_id) on delete cascade,
  title           text not null default '',
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index stella_conversations_user_idx
  on public.stella_conversations (user_id, last_message_at desc);

-- 3.16 stella_messages — assistant transcript. Tool fields nullable.
create table public.stella_messages (
  message_id  uuid primary key default gen_random_uuid(),
  convo_id    uuid not null references public.stella_conversations(convo_id) on delete cascade,
  role        public.stella_message_role not null,
  text        text,
  tool_use_id text,
  tool_name   text,
  tool_result text,
  created_at  timestamptz not null default now()
);
create index stella_messages_convo_created_idx
  on public.stella_messages (convo_id, created_at);

------------------------------------------------------------------------------
-- 4. Helper functions
--
-- Defined SECURITY DEFINER + STABLE so they can be used inside RLS policies
-- without triggering recursive policy evaluation on `friendships` itself.
------------------------------------------------------------------------------

-- 4.1 is_friend(a, b) — symmetric friendship check using the canonical row.
create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.user_a = least(a, b) and f.user_b = greatest(a, b))
  ) and a is not null and b is not null and a <> b;
$$;

revoke all on function public.is_friend(uuid, uuid) from public;
grant execute on function public.is_friend(uuid, uuid) to authenticated, service_role;

-- 4.2 get_friends(uuid) — flattened friend_id column regardless of side.
create or replace function public.get_friends(p_user_id uuid)
returns table(friend_id uuid, friended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select case when f.user_a = p_user_id then f.user_b else f.user_a end as friend_id,
         f.created_at as friended_at
  from public.friendships f
  where f.user_a = p_user_id or f.user_b = p_user_id;
$$;

revoke all on function public.get_friends(uuid) from public;
grant execute on function public.get_friends(uuid) to authenticated, service_role;

-- 4.3 is_hangout_member(uid, hid) — membership check used by RLS policies.
-- SECURITY DEFINER so the inner read of public.hangout_members runs as the
-- function owner and is NOT re-evaluated by the same policy that calls this
-- helper. Without it, any policy that reads hangout_members from inside a
-- USING clause attached to hangout_members triggers infinite recursion.
create or replace function public.is_hangout_member(p_user_id uuid, p_hangout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hangout_members m
    where m.hangout_id = p_hangout_id and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_hangout_member(uuid, uuid) from public;
grant execute on function public.is_hangout_member(uuid, uuid) to authenticated, service_role;

-- 4.4 user_in_any_hangout(uid, hids[]) — same idea but for the GROUP
-- visibility check on OOTDs, where visibility_targets is a uuid[] of hangout_ids.
create or replace function public.user_in_any_hangout(p_user_id uuid, p_hangout_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hangout_members m
    where m.user_id = p_user_id
      and m.hangout_id = any(p_hangout_ids)
  );
$$;

revoke all on function public.user_in_any_hangout(uuid, uuid[]) from public;
grant execute on function public.user_in_any_hangout(uuid, uuid[]) to authenticated, service_role;

-- 4.5 combo_shared_in_user_hangout(uid, combo_id) — used by the combinations
-- visibility policy: a combo is visible if it was shared into a hangout the
-- requester is also a member of.
create or replace function public.combo_shared_in_user_hangout(p_user_id uuid, p_combo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hangout_members m_share
    join public.hangout_members m_self on m_self.hangout_id = m_share.hangout_id
    where m_share.shared_combo_id = p_combo_id
      and m_self.user_id = p_user_id
  );
$$;

revoke all on function public.combo_shared_in_user_hangout(uuid, uuid) from public;
grant execute on function public.combo_shared_in_user_hangout(uuid, uuid) to authenticated, service_role;

-- 4.3 ootd_visibility_rank — used by the narrow-only trigger. Lower = more
-- public; transitions are only allowed in the increasing direction.
create or replace function public.ootd_visibility_rank(v public.ootd_visibility)
returns int
language sql
immutable
as $$
  select case v
    when 'PUBLIC'  then 0
    when 'FRIENDS' then 1
    when 'GROUP'   then 2
    when 'DIRECT'  then 3
  end;
$$;

------------------------------------------------------------------------------
-- 5. Triggers
------------------------------------------------------------------------------

-- 5.1 OOTD posts: visibility may only narrow, never widen (§12.3).
create or replace function public.ootd_posts_visibility_only_narrows()
returns trigger
language plpgsql
as $$
begin
  if new.visibility is distinct from old.visibility then
    if public.ootd_visibility_rank(new.visibility)
       < public.ootd_visibility_rank(old.visibility) then
      raise exception
        'OOTD visibility may only narrow, not widen (was %, attempted %)',
        old.visibility, new.visibility
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger ootd_posts_visibility_only_narrows
before update on public.ootd_posts
for each row
execute function public.ootd_posts_visibility_only_narrows();

-- 5.2 Selfies: hard cap of 5 per user (§9.2). Trigger so the message is
-- explicit; a partial unique index can't say "max N" cleanly.
create or replace function public.selfies_max_5_per_user()
returns trigger
language plpgsql
as $$
declare
  cnt int;
begin
  select count(*) into cnt
  from public.selfies
  where user_id = new.user_id;
  if cnt >= 5 then
    raise exception
      'Selfie limit reached: a user may have at most 5 selfies'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger selfies_max_5_per_user
before insert on public.selfies
for each row
execute function public.selfies_max_5_per_user();

-- 5.3 chat_threads.last_message_at maintained on INSERT into chat_messages.
create or replace function public.chat_messages_touch_thread()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads
  set last_message_at = new.created_at
  where thread_id = new.thread_id
    and (last_message_at is null or last_message_at < new.created_at);
  return new;
end;
$$;

create trigger chat_messages_touch_thread
after insert on public.chat_messages
for each row
execute function public.chat_messages_touch_thread();

-- 5.4 stella_conversations.last_message_at on stella_messages insert.
create or replace function public.stella_messages_touch_convo()
returns trigger
language plpgsql
as $$
begin
  update public.stella_conversations
  set last_message_at = new.created_at
  where convo_id = new.convo_id
    and last_message_at < new.created_at;
  return new;
end;
$$;

create trigger stella_messages_touch_convo
after insert on public.stella_messages
for each row
execute function public.stella_messages_touch_convo();

-- 5.5 closet_items.updated_at — keep in sync on UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger closet_items_touch_updated_at
before update on public.closet_items
for each row
execute function public.touch_updated_at();

------------------------------------------------------------------------------
-- 6. pg_cron jobs (Pro tier — gated)
--
-- §12.4 requires hangouts to auto-expire 12h after starts_at. The job below
-- is the intended shape; the CREATE EXTENSION on pg_cron is commented out at
-- the top of this file and these statements stay commented until we move to
-- Pro tier. TODO(infra): uncomment together with the extension once on Pro.
------------------------------------------------------------------------------

-- select cron.schedule(
--   'mei_expire_hangouts',
--   '*/5 * * * *',  -- every five minutes
--   $$update public.hangouts
--      set status = 'EXPIRED'
--      where status = 'ACTIVE' and expires_at <= now()$$
-- );
