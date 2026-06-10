-- Owner-only weather coordinates for the Today strip.
--
-- Keep precise-ish coordinates out of public.users: that table is selectable
-- by discoverable/friend profile flows. This table is only visible to the
-- owner and stores rounded coordinates good enough for weather.

create table public.user_weather_locations (
  user_id    uuid primary key references public.users(user_id) on delete cascade,
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  city       text,
  updated_at timestamptz not null default now()
);

alter table public.user_weather_locations enable row level security;

create policy user_weather_locations_select_self
  on public.user_weather_locations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_weather_locations_insert_self
  on public.user_weather_locations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_weather_locations_update_self
  on public.user_weather_locations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_weather_locations_delete_self
  on public.user_weather_locations
  for delete
  to authenticated
  using (auth.uid() = user_id);
