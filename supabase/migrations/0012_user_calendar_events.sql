-- Owner-only calendar snapshots for the Today strip.
--
-- The mobile app reads OS calendar events after permission, then syncs only
-- the current local-day window here. Event titles and locations are private
-- context, so this table is visible only to the owning user.

create table public.user_calendar_events (
  user_id         uuid not null references public.users(user_id) on delete cascade,
  device_event_id text not null,
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location_name   text,
  occasion_guess  public.occasion,
  updated_at      timestamptz not null default now(),
  primary key (user_id, device_event_id)
);

create index user_calendar_events_user_starts_idx
  on public.user_calendar_events (user_id, starts_at);

alter table public.user_calendar_events enable row level security;

create policy user_calendar_events_select_self
  on public.user_calendar_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_calendar_events_insert_self
  on public.user_calendar_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_calendar_events_update_self
  on public.user_calendar_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_calendar_events_delete_self
  on public.user_calendar_events
  for delete
  to authenticated
  using (auth.uid() = user_id);
