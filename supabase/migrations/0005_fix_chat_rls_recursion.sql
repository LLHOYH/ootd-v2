-- Mei — fix infinite-recursion in chat_thread_participants RLS.
--
-- Bug: `chat_thread_participants_select_self_or_co` reads
-- chat_thread_participants from inside its own USING clause, so each row
-- check re-enters the same policy → 42P17 "infinite recursion detected".
-- The downstream chat_messages_select / chat_messages_insert policies hit
-- the same pothole because they also read participants.
--
-- Fix: move the membership check into a SECURITY DEFINER helper that
-- bypasses RLS on its inner read (same pattern as is_hangout_member /
-- combo_shared_in_user_hangout in 0001_init_schema.sql).

------------------------------------------------------------------------------
-- 1. Helper.
------------------------------------------------------------------------------

create or replace function public.is_thread_participant(p_user_id uuid, p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_thread_participants p
    where p.thread_id = p_thread_id
      and p.user_id   = p_user_id
  );
$$;

revoke all on function public.is_thread_participant(uuid, uuid) from public;
grant execute on function public.is_thread_participant(uuid, uuid) to authenticated, service_role;

------------------------------------------------------------------------------
-- 2. Replace the recursive policies.
------------------------------------------------------------------------------

drop policy if exists chat_threads_visible_to_participants
  on public.chat_threads;
create policy chat_threads_visible_to_participants
  on public.chat_threads
  for select
  to authenticated
  using (public.is_thread_participant(auth.uid(), chat_threads.thread_id));

drop policy if exists chat_thread_participants_select_self_or_co
  on public.chat_thread_participants;
create policy chat_thread_participants_select_self_or_co
  on public.chat_thread_participants
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_thread_participant(auth.uid(), chat_thread_participants.thread_id)
  );

drop policy if exists chat_messages_select_participant
  on public.chat_messages;
create policy chat_messages_select_participant
  on public.chat_messages
  for select
  to authenticated
  using (public.is_thread_participant(auth.uid(), chat_messages.thread_id));

drop policy if exists chat_messages_insert_participant
  on public.chat_messages;
create policy chat_messages_insert_participant
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(auth.uid(), chat_messages.thread_id)
  );
