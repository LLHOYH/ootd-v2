-- 0009_tryon_cap_dogfood.sql
--
-- Two changes to the tryon_generations_daily_cap trigger:
--
--   1. Raise the cap from 10 → 250. At $0.04/gen on Replicate IDM-VTON
--      that's a ~$10/day ceiling, which is the founder's stated budget
--      while dogfooding. The cap exists as a runaway-cost circuit
--      breaker, not as product rationing — we'll tighten it again when
--      we open to users.
--
--   2. Only count rows whose status is PENDING or READY. The previous
--      version counted FAILED rows too, which meant a Replicate flake
--      burned a slot for no value. PENDING rows still count (they
--      represent in-flight predictions that may yet succeed); a stuck
--      PENDING row will count until manually cleared, which is the
--      right behavior for a runaway-cost circuit breaker.
--
-- The trigger itself does not need to be re-created — it references the
-- function by name and `create or replace` swaps the body in place.

create or replace function public.tryon_generations_daily_cap()
returns trigger
language plpgsql
as $$
declare
  today_count int;
begin
  select count(*)
    into today_count
    from public.tryon_generations
    where user_id = new.user_id
      and status in ('PENDING', 'READY')
      and created_at >= date_trunc('day', now());
  if today_count >= 250 then
    raise exception
      'Try-on limit reached: max 250 generations per day per user'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
