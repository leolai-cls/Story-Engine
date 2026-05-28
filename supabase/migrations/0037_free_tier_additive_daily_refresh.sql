-- Migration 0037 — Free tier daily refresh: floor → additive (+50/day with cap)
-- ===========================================================
-- Session 16 PM Review #2 (P-04) fix · spec vs code drift per hard rule #36.
--
-- The drift:
--   Marketing copy (3 locales): 「1,000 註冊送 · 每日 50」 + FAQ「每日 50
--   credits 自動補」 — additive semantic (wallet grows).
--   Pricing v3 spec math: 1k + 50 × 30 days = 2,500 credits/mo Free budget.
--   Code (0008 / 0035 / 0036 refresh_free_tier_credits):
--     UPDATE credit_balance = 50 WHERE credit_balance < 50  (FLOOR to 50)
--
-- After day 1 the user has 1000 credits. Plays 25 turns → balance 250.
-- Floor behavior: 250 ≥ 50 → no refresh. Day 2/3/4 same. Marketing implies
-- additive. Pay-or-die after first day.
--
-- Fix: switch to additive +50/day with monthly cap to prevent runaway
-- accumulation (free user shouldn't accumulate up to Standard tier's 2k/mo).
--
-- Behavior change (effective on next cron tick):
--   - Free user gets +50 credits each day (cap at FREE_TIER_DAILY_CAP = 1000)
--   - Already-large balances do NOT receive top-up
--   - 23-hour ledger guard (from 0036 C-02) prevents Vercel cron retry double-grant
--   - Ledger row records the exact delta granted (could be < 50 if hitting cap)
--
-- Why cap at 1000:
--   - Pricing v3 spec math implies ~2.5k/mo Free budget. Daily 50 over 30 days
--     = 1500 in addition to 1k signup. Cap at 1000 keeps free user under Standard
--     tier's 2k/mo to preserve upgrade pressure.
--   - Free user who plays daily (low spend) wallet grows but plateaus at 1000.
--   - Free user who plays heavy (high spend) gets full 50/day refill.
--
-- REQUIRES: 0036 applied.

create or replace function public.refresh_free_tier_credits(
  p_target_balance integer default 50  -- legacy param name · now interpreted as daily INCREMENT
)
returns table (
  refreshed_count integer,
  total_credits_granted integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_increment integer;
  v_new_balance integer;
  v_old_balance integer;
  v_refreshed integer := 0;
  v_total integer := 0;
  -- Free tier wallet cap · prevents runaway accumulation
  -- Should remain below Standard tier's monthly budget (2,000) to preserve
  -- upgrade pressure.
  c_daily_cap constant integer := 1000;
begin
  if p_target_balance <= 0 or p_target_balance > 500 then
    raise exception 'refresh_free_tier_credits: invalid daily increment % (must be 1-500)', p_target_balance;
  end if;

  for v_user in
    select id, credit_balance
      from public.profiles p
      where subscription_tier = 'free'
        -- 23-hour ledger window guard (from 0036 C-02 · prevents Vercel cron
        -- retry-after-spend double-grant exploit)
        and not exists (
          select 1 from public.credit_ledger cl
          where cl.user_id = p.id
            and cl.reason = 'free_tier_refresh'
            and cl.created_at > now() - interval '23 hours'
        )
        -- Skip users already at/above cap · no point granting
        and credit_balance < c_daily_cap
      for update skip locked
  loop
    -- Compute actual increment · respects cap
    -- If user has balance 970 and daily increment 50 → grant 30 (to reach 1000)
    -- If user has balance 100 and daily increment 50 → grant 50
    v_increment := least(p_target_balance, c_daily_cap - v_user.credit_balance);

    if v_increment <= 0 then
      continue;
    end if;

    update public.profiles
      set credit_balance = credit_balance + v_increment,
          updated_at = now()
      where id = v_user.id
        and credit_balance < c_daily_cap
      returning credit_balance into v_new_balance;

    if v_new_balance is null then
      continue;
    end if;

    v_old_balance := v_user.credit_balance;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, ref_type, ref_id, metadata
    )
    values (
      v_user.id,
      v_increment,
      v_new_balance,
      'free_tier_refresh',
      null,
      null,
      jsonb_build_object(
        'daily_increment', p_target_balance,
        'actual_granted', v_increment,
        'cap', c_daily_cap,
        'balance_before', v_old_balance,
        'refreshed_at', now()
      )
    );

    v_refreshed := v_refreshed + 1;
    v_total := v_total + v_increment;
  end loop;

  refreshed_count := v_refreshed;
  total_credits_granted := v_total;
  return next;
end;
$$;

revoke execute on function public.refresh_free_tier_credits(integer) from public, anon, authenticated;
grant execute on function public.refresh_free_tier_credits(integer) to service_role;

comment on function public.refresh_free_tier_credits is
  'Daily Free-tier additive credit refresh. +50/day with cap at 1000 wallet ceiling. Idempotent via 23-hour ledger window guard. Aligns with marketing copy 「每日 50 自動補」 and Pricing v3 spec math (1k + 50/day budget).';

-- Sanity
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'refresh_free_tier_credits'
      and prosrc like '%c_daily_cap%'
      and prosrc like '%balance_before%'
  ) then
    raise exception '0037: refresh_free_tier_credits additive semantics not applied';
  end if;
end $$;
