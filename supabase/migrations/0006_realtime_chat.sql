-- Mei — opt the chat tables into Supabase Realtime broadcasts.
--
-- The `supabase_realtime` publication powers `postgres_changes` events sent
-- to authenticated client subscriptions. New Supabase projects ship with
-- the publication empty (FOR TABLES nothing) — they enable per-table
-- broadcasting only after migrations explicitly request it. Without this
-- migration `useChatThread`'s subscription receives nothing.
--
-- Replica identity FULL on the messages table makes payloads include the
-- complete row — for INSERTs the default identity is enough, but FULL is
-- cheap and gives us complete payloads on UPDATEs / DELETEs that future
-- features (edit, delete, reactions on chat messages) will rely on.

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_threads;
alter publication supabase_realtime add table public.chat_thread_participants;

alter table public.chat_messages replica identity full;
alter table public.chat_thread_participants replica identity full;
