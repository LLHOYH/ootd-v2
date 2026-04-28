-- Mei — Row-Level Security policies (SPEC.md §12)
--
-- Every public.* table has RLS enabled below. Each privacy rule from §12 is
-- realised as one or more named policies; policy names match the names cited
-- in the spec where one was given. Policies use auth.uid() to identify the
-- caller; service_role bypasses RLS entirely (used by image-worker, notifier,
-- and seed scripts).

------------------------------------------------------------------------------
-- 0. Enable RLS on every table
------------------------------------------------------------------------------

alter table public.users                    enable row level security;
alter table public.closet_items             enable row level security;
alter table public.combinations             enable row level security;
alter table public.combination_items        enable row level security;
alter table public.selfies                  enable row level security;
alter table public.friendships              enable row level security;
alter table public.friend_requests          enable row level security;
alter table public.ootd_posts               enable row level security;
alter table public.ootd_reactions           enable row level security;
alter table public.hangouts                 enable row level security;
alter table public.hangout_members          enable row level security;
alter table public.chat_threads             enable row level security;
alter table public.chat_thread_participants enable row level security;
alter table public.chat_messages            enable row level security;
alter table public.stella_conversations     enable row level security;
alter table public.stella_messages          enable row level security;

------------------------------------------------------------------------------
-- 1. users (§12.5 discoverability + §12.7 friend graph)
------------------------------------------------------------------------------

-- Self-read.
create policy users_select_self
  on public.users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- §12.5 users_select_visible — discoverable OR friend OR self.
create policy users_select_visible
  on public.users
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or discoverable = true
    or public.is_friend(auth.uid(), user_id)
  );

-- A user may insert/update their own row only.
create policy users_insert_self
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy users_update_self
  on public.users
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

------------------------------------------------------------------------------
-- 2. closet_items (§12.2)
------------------------------------------------------------------------------

-- §12.2 closet_items_owner_all — owner has full control.
create policy closet_items_owner_all
  on public.closet_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- §12.2 closet_items_via_ootd — friends can SELECT a closet item only when
-- it appears in a combination referenced by an OOTD post the requester can
-- see. Mirrors the visibility logic in ootd_posts_visibility.
create policy closet_items_via_ootd
  on public.closet_items
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.combination_items ci
      join public.combinations c on c.combo_id = ci.combo_id
      join public.ootd_posts p   on p.combo_id = c.combo_id
      where ci.item_id = closet_items.item_id
        and (
          p.user_id = auth.uid()
          or (
            p.visibility in ('PUBLIC','FRIENDS')
            and public.is_friend(auth.uid(), p.user_id)
          )
          or (
            p.visibility = 'GROUP'
            and exists (
              select 1 from public.hangout_members m
              where m.user_id = auth.uid()
                and m.hangout_id = any(p.visibility_targets)
            )
          )
          or (
            p.visibility = 'DIRECT'
            and auth.uid() = any(p.visibility_targets)
          )
        )
    )
  );

------------------------------------------------------------------------------
-- 3. combinations + combination_items
--
-- A combination is visible if you own it OR it's referenced by an OOTD post
-- you can see (parallel to closet_items_via_ootd). combination_items follow
-- their parent combo.
------------------------------------------------------------------------------

create policy combinations_owner_all
  on public.combinations
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy combinations_via_ootd
  on public.combinations
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.ootd_posts p
      where p.combo_id = combinations.combo_id
        and (
          p.user_id = auth.uid()
          or (p.visibility in ('PUBLIC','FRIENDS') and public.is_friend(auth.uid(), p.user_id))
          or (p.visibility = 'GROUP' and exists (
                select 1 from public.hangout_members m
                where m.user_id = auth.uid() and m.hangout_id = any(p.visibility_targets)))
          or (p.visibility = 'DIRECT' and auth.uid() = any(p.visibility_targets))
        )
    )
    -- Or this combo was shared into a hangout the requester is in.
    or exists (
      select 1 from public.hangout_members m
      where m.shared_combo_id = combinations.combo_id
        and exists (
          select 1 from public.hangout_members me
          where me.hangout_id = m.hangout_id and me.user_id = auth.uid()
        )
    )
  );

-- combination_items inherits combo visibility for SELECT; mutation is
-- restricted to the combo owner.
create policy combination_items_select
  on public.combination_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.combinations c
      where c.combo_id = combination_items.combo_id
    )
    -- Visibility actually evaluated by the combinations policy above; this
    -- predicate is just "the parent combo exists". Postgres evaluates the
    -- combinations RLS when the planner expands the join, so a user only
    -- sees rows whose parent combo their policy grants.
  );

create policy combination_items_owner_write
  on public.combination_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.combinations c
      where c.combo_id = combination_items.combo_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.combinations c
      where c.combo_id = combination_items.combo_id
        and c.user_id = auth.uid()
    )
  );

------------------------------------------------------------------------------
-- 4. selfies (§12.1) — owner-only, both SELECT and INSERT.
------------------------------------------------------------------------------

-- §12.1 selfies_owner_only — owner is the only reader/writer.
create policy selfies_owner_only
  on public.selfies
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

------------------------------------------------------------------------------
-- 5. friendships (§12.7) + friend_requests
------------------------------------------------------------------------------

-- A friendship row is visible to either side of the relationship.
create policy friendships_select_either_side
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Friendships are written by the API (after a request is accepted) using the
-- service role. Authenticated users can DELETE their own (unfriend).
create policy friendships_unfriend
  on public.friendships
  for delete
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Friend requests: visible to sender + recipient.
create policy friend_requests_select_either
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Sender can create; either side can update (accept/decline/cancel).
create policy friend_requests_insert_self
  on public.friend_requests
  for insert
  to authenticated
  with check (auth.uid() = from_user_id);

create policy friend_requests_update_either
  on public.friend_requests
  for update
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id)
  with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy friend_requests_delete_either
  on public.friend_requests
  for delete
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

------------------------------------------------------------------------------
-- 6. ootd_posts (§12.3)
------------------------------------------------------------------------------

-- §12.3 ootd_posts_visibility — exact predicate from the spec.
create policy ootd_posts_visibility
  on public.ootd_posts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (visibility in ('PUBLIC','FRIENDS') and public.is_friend(auth.uid(), user_id))
    or (visibility = 'GROUP' and exists (
          select 1 from public.hangout_members m
          where m.user_id = auth.uid()
            and m.hangout_id = any(visibility_targets)))
    or (visibility = 'DIRECT' and auth.uid() = any(visibility_targets))
  );

create policy ootd_posts_owner_insert
  on public.ootd_posts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Owner-only update (the trigger separately enforces narrow-only visibility).
create policy ootd_posts_owner_update
  on public.ootd_posts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy ootd_posts_owner_delete
  on public.ootd_posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

------------------------------------------------------------------------------
-- 7. ootd_reactions — visible if the parent OOTD is visible; insert/delete
-- restricted to the reacting user.
------------------------------------------------------------------------------

create policy ootd_reactions_select_visible
  on public.ootd_reactions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.ootd_posts p
      where p.ootd_id = ootd_reactions.ootd_id
    )
  );

create policy ootd_reactions_insert_self
  on public.ootd_reactions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ootd_posts p
      where p.ootd_id = ootd_reactions.ootd_id
    )
  );

create policy ootd_reactions_delete_self
  on public.ootd_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

------------------------------------------------------------------------------
-- 8. hangouts + hangout_members (§12.4)
------------------------------------------------------------------------------

-- A hangout is visible to its members (or the owner).
create policy hangouts_visible_to_members
  on public.hangouts
  for select
  to authenticated
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.hangout_members m
      where m.hangout_id = hangouts.hangout_id and m.user_id = auth.uid()
    )
  );

-- Owner can update/delete the hangout. Auto-expiry runs as service_role via
-- pg_cron, which bypasses RLS.
create policy hangouts_owner_insert
  on public.hangouts
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy hangouts_owner_update
  on public.hangouts
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy hangouts_owner_delete
  on public.hangouts
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- §12.4 hangout_members_visible_to_members — co-members can see each other.
create policy hangout_members_visible_to_members
  on public.hangout_members
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.hangout_members m
      where m.hangout_id = hangout_members.hangout_id and m.user_id = auth.uid()
    )
  );

-- Owner can invite (insert) members; users can join themselves (self-row insert).
create policy hangout_members_insert_owner
  on public.hangout_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.hangouts h
      where h.hangout_id = hangout_members.hangout_id and h.owner_id = auth.uid()
    )
    or auth.uid() = user_id
  );

-- Members can update their own row (RSVP, share a combo). Owner can update
-- any row in their hangout (e.g. promote roles).
create policy hangout_members_update_self_or_owner
  on public.hangout_members
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.hangouts h
      where h.hangout_id = hangout_members.hangout_id and h.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.hangouts h
      where h.hangout_id = hangout_members.hangout_id and h.owner_id = auth.uid()
    )
  );

-- Owner can remove any member; member can leave (delete own row).
create policy hangout_members_delete_self_or_owner
  on public.hangout_members
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.hangouts h
      where h.hangout_id = hangout_members.hangout_id and h.owner_id = auth.uid()
    )
  );

------------------------------------------------------------------------------
-- 9. chat_threads + chat_thread_participants + chat_messages
--
-- A thread is visible to its participants. Messages and per-user state inherit
-- via the participants row.
------------------------------------------------------------------------------

create policy chat_threads_visible_to_participants
  on public.chat_threads
  for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_thread_participants p
      where p.thread_id = chat_threads.thread_id and p.user_id = auth.uid()
    )
  );

-- Thread creation — any authenticated user. Participant rows are inserted in
-- the same transaction by the API; the participants RLS gates membership.
create policy chat_threads_authenticated_insert
  on public.chat_threads
  for insert
  to authenticated
  with check (true);

create policy chat_thread_participants_select_self_or_co
  on public.chat_thread_participants
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_thread_participants me
      where me.thread_id = chat_thread_participants.thread_id
        and me.user_id = auth.uid()
    )
  );

create policy chat_thread_participants_insert_self
  on public.chat_thread_participants
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    -- API uses service_role to add other participants on group/hangout creation.
  );

create policy chat_thread_participants_update_self
  on public.chat_thread_participants
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy chat_thread_participants_delete_self
  on public.chat_thread_participants
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy chat_messages_select_participant
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_thread_participants p
      where p.thread_id = chat_messages.thread_id and p.user_id = auth.uid()
    )
  );

create policy chat_messages_insert_participant
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_thread_participants p
      where p.thread_id = chat_messages.thread_id and p.user_id = auth.uid()
    )
  );

-- Sender may delete their own message; no UPDATE policy (immutable history).
create policy chat_messages_delete_self
  on public.chat_messages
  for delete
  to authenticated
  using (sender_id = auth.uid());

------------------------------------------------------------------------------
-- 10. stella_conversations + stella_messages — owner-only across the board.
------------------------------------------------------------------------------

create policy stella_conversations_owner_all
  on public.stella_conversations
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy stella_messages_owner_all
  on public.stella_messages
  for all
  to authenticated
  using (
    exists (
      select 1 from public.stella_conversations c
      where c.convo_id = stella_messages.convo_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stella_conversations c
      where c.convo_id = stella_messages.convo_id and c.user_id = auth.uid()
    )
  );

------------------------------------------------------------------------------
-- 11. Default privileges — anon role gets nothing on public schema.
--
-- Supabase grants `anon` and `authenticated` SELECT-by-default on `public`
-- for new tables; we want only `authenticated` (and `service_role`) to
-- evaluate against RLS. Revoke from anon explicitly.
------------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
