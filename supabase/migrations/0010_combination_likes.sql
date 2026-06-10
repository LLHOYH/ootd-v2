-- Persist the Today "save this look" heart.
--
-- One row means one user liked one saved combination. P0 uses this for
-- the caller's own Today's Pick, so inserts are restricted to combinations
-- owned by the same user.

create table public.combination_likes (
  user_id    uuid not null references public.users(user_id) on delete cascade,
  combo_id   uuid not null references public.combinations(combo_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, combo_id)
);

create index combination_likes_combo_idx
  on public.combination_likes (combo_id, created_at desc);

alter table public.combination_likes enable row level security;

create policy combination_likes_select_self
  on public.combination_likes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy combination_likes_insert_self_owned_combo
  on public.combination_likes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.combinations c
      where c.combo_id = combination_likes.combo_id
        and c.user_id = auth.uid()
    )
  );

create policy combination_likes_delete_self
  on public.combination_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);
