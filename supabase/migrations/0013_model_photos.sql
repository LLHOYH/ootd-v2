-- 0013_model_photos.sql
--
-- Reusable model photo pipeline.
--
-- A model photo is the clean, private reference image generated from a
-- user's uploaded selfies. Future try-on flows can use this output instead
-- of repeatedly sending raw selfies to the image model.

do $$
begin
  create type public.model_photo_status as enum ('PENDING', 'READY', 'FAILED');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.model_photos (
  model_photo_id    uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(user_id) on delete cascade,
  source_selfie_ids uuid[] not null default '{}',
  status            public.model_photo_status not null default 'PENDING',
  storage_key       text,
  provider_id       text,
  error_detail      text,
  prompt_version    text not null default 'mei-model-v1',
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  constraint model_photos_source_selfies_cap
    check (coalesce(array_length(source_selfie_ids, 1), 0) <= 5)
);

create index if not exists model_photos_user_created_idx
  on public.model_photos (user_id, created_at desc);

alter table public.model_photos enable row level security;

do $$
begin
  create policy model_photos_owner_select
    on public.model_photos
    for select
    to authenticated
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy model_photos_owner_insert
    on public.model_photos
    for insert
    to authenticated
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy model_photos_owner_update
    on public.model_photos
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy model_photos_owner_delete
    on public.model_photos
    for delete
    to authenticated
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'model-photos',
  'model-photos',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

do $$
begin
  create policy model_photos_storage_owner_select
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'model-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy model_photos_storage_owner_delete
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'model-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end
$$;
