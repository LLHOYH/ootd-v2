-- 0008_tryon_generations.sql
--
-- Try-on generation pipeline (SPEC §10.10 "Wear-this", PR C of the selfie
-- trilogy: A=upload, B=analysis (skipped per product call), C=synthesis).
--
-- A generation row tracks one Replicate IDM-VTON call: which selfie was
-- the human reference, which combination + item was the garment, what
-- the resulting storage key is, and whether the call is still pending,
-- ready, or failed.
--
-- The result image lives in a new private storage bucket `tryon-generated`,
-- owner-only. RLS on this table is owner-only too, mirroring `selfies`.

-- ---------------------------------------------------------------------------
-- 1. tryon_generations table
-- ---------------------------------------------------------------------------

create type public.tryon_status as enum ('PENDING', 'READY', 'FAILED');

create table public.tryon_generations (
  generation_id     uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(user_id) on delete cascade,
  selfie_id         uuid not null references public.selfies(selfie_id) on delete cascade,
  combo_id          uuid not null references public.combinations(combo_id) on delete cascade,
  -- The single item within `combo_id` that the VTON model actually
  -- received as the garment input. v1 picks one item per generation; v2
  -- can chain multiple passes and store them as separate rows.
  item_id           uuid not null references public.closet_items(item_id) on delete cascade,
  status            public.tryon_status not null default 'PENDING',
  -- Path in the `tryon-generated` storage bucket. Null until READY.
  generated_storage_key text,
  -- Replicate's prediction id, when applicable. Useful for log forensics
  -- and for cancelling an in-flight prediction later.
  provider_id       text,
  -- Short error string when status='FAILED'. We surface this in the UI
  -- so the user knows whether to retry or pick a different selfie.
  error_detail      text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index tryon_generations_user_created_idx
  on public.tryon_generations (user_id, created_at desc);

create index tryon_generations_combo_idx
  on public.tryon_generations (user_id, combo_id, selfie_id);

-- ---------------------------------------------------------------------------
-- 2. Row-level security — owner-only.
-- ---------------------------------------------------------------------------

alter table public.tryon_generations enable row level security;

create policy tryon_generations_owner_select
  on public.tryon_generations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy tryon_generations_owner_insert
  on public.tryon_generations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy tryon_generations_owner_update
  on public.tryon_generations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy tryon_generations_owner_delete
  on public.tryon_generations
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. tryon-generated storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tryon-generated',
  'tryon-generated',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path convention: `{user_id}/{generation_id}.webp`
-- Same `(storage.foldername(name))[1] = auth.uid()::text` shape the
-- closet-tuned and selfies policies use.

create policy tryon_generated_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tryon-generated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Inserts come from the image-worker via the service-role key, which
-- bypasses RLS — so we don't need a permissive insert policy. We *do*
-- need an explicit delete policy so the user can clean up their own
-- generations, and that bypass-free path requires auth.uid() matching.

create policy tryon_generated_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tryon-generated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 4. Daily rate-limit helper (10 generations / user / day).
--
-- Authoritative cap lives in the api Lambda, but the trigger is a
-- defence-in-depth so a bug in the client can't bill us $200 of
-- Replicate via a stuck loop.
-- ---------------------------------------------------------------------------

create or replace function public.tryon_generations_daily_cap()
returns trigger
language plpgsql
as $$
declare
  today_count int;
begin
  select count(*)
    into today_count
    from public.tryon_generations
    where user_id = new.user_id
      and created_at >= date_trunc('day', now());
  if today_count >= 10 then
    raise exception
      'Try-on limit reached: max 10 generations per day per user'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tryon_generations_daily_cap
before insert on public.tryon_generations
for each row
execute function public.tryon_generations_daily_cap();
