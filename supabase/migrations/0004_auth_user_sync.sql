-- Mei — auth.users → public.users synchronisation
--
-- A Supabase Auth signup creates a row in `auth.users` but does NOT touch
-- `public.users`. SPEC §3.1 binds the two: `public.users.user_id` references
-- `auth.users(id)`. Without this trigger every signup would 401 on the first
-- authenticated request because RLS would find no matching public profile.
--
-- The trigger derives a provisional username from the email's local part,
-- disambiguates collisions with a numeric suffix, and seeds `display_name`
-- from `raw_user_meta_data.display_name` (set by the client at sign-up time)
-- or falls back to the username. `discoverable` keeps the §12.5 default of
-- false from `0001_init_schema.sql`. The user can rename themselves and
-- toggle discoverability later via PATCH /me (SPEC §13.1 P0).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Lower-case the local part and strip everything that isn't a-z / 0-9 / _.
  -- Empty result (e.g. email = "@x.com") falls back to "user" so we never
  -- violate the NOT NULL on public.users.username.
  base_username text := lower(
    regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g')
  );
  candidate text;
  i int := 1;
begin
  if base_username is null or length(base_username) = 0 then
    base_username := 'user';
  end if;
  candidate := base_username;

  -- Disambiguate username collisions deterministically. Loop is bounded by
  -- the unique-index lookup; in practice it terminates within a few tries.
  while exists (select 1 from public.users where username = candidate) loop
    candidate := base_username || i;
    i := i + 1;
  end loop;

  insert into public.users (user_id, username, display_name)
  values (
    new.id,
    candidate,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      candidate
    )
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
