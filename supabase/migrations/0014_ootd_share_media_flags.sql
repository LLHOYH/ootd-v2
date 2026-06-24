-- Let OOTD posts remember which media the author chose to share.
-- Existing rows default to both so the current feed keeps rendering.
alter table public.ootd_posts
  add column if not exists share_dresses boolean not null default true,
  add column if not exists share_model boolean not null default true;
