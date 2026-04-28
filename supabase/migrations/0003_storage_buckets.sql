-- Mei — Supabase Storage buckets + RLS (SPEC.md §6.3 + §9.4 + §12.7)
--
-- Four buckets, one per asset class. RLS on `storage.objects` does the
-- access gating; no signed-URL plumbing needed (§9.4). Path convention is
-- `{user_id}/{asset_id}.{ext}` in every bucket.
--
-- `storage.foldername(name)` returns the path components as a text[]. With
-- the `{user_id}/...` convention, `(storage.foldername(name))[1]` is the
-- owner uuid as text.

------------------------------------------------------------------------------
-- 1. Bucket definitions
--
-- `closet-tuned` and `ootd` are marked public so the CDN can cache them, but
-- access is still gated by RLS — Supabase's "public" flag controls only the
-- *default* of whether unauthenticated path access works without RLS, and
-- our policies require auth.uid(). When in doubt: read the policies, not
-- the public flag.
------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('closet-raw',   'closet-raw',   false, 52428800, array['image/jpeg','image/png','image/heic','image/heif']),
  ('closet-tuned', 'closet-tuned', true,  10485760, array['image/webp','image/jpeg']),
  ('selfies',      'selfies',      false, 10485760, array['image/jpeg','image/heic','image/heif']),
  ('ootd',         'ootd',         true,  10485760, array['image/webp','image/jpeg'])
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- 2. Enable RLS on storage.objects (Supabase enables by default — explicit).
------------------------------------------------------------------------------

alter table storage.objects enable row level security;

------------------------------------------------------------------------------
-- 3. closet-raw — owner-only SELECT/INSERT/DELETE.
------------------------------------------------------------------------------

create policy closet_raw_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'closet-raw'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy closet_raw_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'closet-raw'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy closet_raw_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'closet-raw'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

------------------------------------------------------------------------------
-- 4. closet-tuned — owner OR friend SELECT (§12.7); owner-only writes happen
-- via service_role from the image-worker so we add no INSERT policy here.
------------------------------------------------------------------------------

create policy closet_tuned_owner_or_friend
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'closet-tuned'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_friend(
        auth.uid(),
        ((storage.foldername(name))[1])::uuid
      )
    )
  );

create policy closet_tuned_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'closet-tuned'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

------------------------------------------------------------------------------
-- 5. selfies — owner-only, both SELECT and INSERT (§12.1).
------------------------------------------------------------------------------

create policy selfies_owner_only_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'selfies'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy selfies_owner_only_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'selfies'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy selfies_owner_only_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'selfies'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

------------------------------------------------------------------------------
-- 6. ootd — visibility-scoped SELECT, mirrors ootd_posts_visibility on
-- public.ootd_posts. Looks up the post by its storage_key (we store the
-- exact `name` in either try_on_storage_key or fallback_outfit_card_storage_key).
-- Writes happen as service_role from the image-worker; no INSERT policy here.
------------------------------------------------------------------------------

create policy ootd_visibility_scoped
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ootd'
    and (
      -- Owner can always read.
      auth.uid()::text = (storage.foldername(name))[1]
      -- Otherwise: at least one ootd_post references this object and grants
      -- read access to the requester per the §12.3 visibility rules.
      or exists (
        select 1
        from public.ootd_posts p
        where (
          p.try_on_storage_key = storage.objects.name
          or p.fallback_outfit_card_storage_key = storage.objects.name
        )
        and (
          p.user_id = auth.uid()
          or (p.visibility in ('PUBLIC','FRIENDS') and public.is_friend(auth.uid(), p.user_id))
          or (p.visibility = 'GROUP' and exists (
                select 1 from public.hangout_members m
                where m.user_id = auth.uid()
                  and m.hangout_id = any(p.visibility_targets)))
          or (p.visibility = 'DIRECT' and auth.uid() = any(p.visibility_targets))
        )
      )
    )
  );

create policy ootd_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ootd'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
