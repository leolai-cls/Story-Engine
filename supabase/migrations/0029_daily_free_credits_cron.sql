-- Migration 0029 · Daily 50-credit refresh for free-tier users
-- ===========================================================
-- Founder rule (pricing v3, 2026-05-26): Free tier gets 1,000 signup
-- credits + 50/day refresh. Adventurer/Storyteller/Legend tiers get
-- credits via Stripe webhook on subscription renewal (already wired
-- in lib/billing/subscription.ts).
--
-- Implementation: pg_cron job runs daily, calls grant_daily_free_credits()
-- which:
--   - Selects users with subscription_tier='free' who haven't been
--     granted in the last 23 hours (idempotency · safe if cron fires
--     twice on the same day · prevents double-grant)
--   - Writes an append-only credit_ledger entry (hard rule #4)
--   - Bumps profiles.credit_balance
--
-- Why 23h instead of 24h:
--   pg_cron uses GMT/UTC. Server clock drift + cron jitter mean the
--   job sometimes runs ~1 minute earlier than the previous day. 23h
--   window catches those without ever double-granting.
--
-- NOTE: This migration is superseded by 0031 (pg_cron dedup) — the
-- cron job is unscheduled and grant_daily_free_credits() is dropped.
-- Daily refresh is handled by Vercel cron → refresh_free_tier_credits()
-- from 0008. This file is committed for repo == prod source-of-truth
-- (the migration was originally applied via Supabase MCP without being
-- committed; Session 16 audit CRIT-01 reconstructed it).
-- =============================================================

-- 1. Enable pg_cron
create extension if not exists pg_cron with schema extensions;

-- 2. The grant function · SECURITY DEFINER so cron's postgres role
--    can call it via service_role-equivalent privileges.
create or replace function public.grant_daily_free_credits()
returns table (granted_user_count integer, granted_credits integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_total integer := 0;
  rec record;
begin
  -- Select free-tier users who haven't received a daily grant in 23 hours.
  -- LIMIT 5000 keeps each run bounded — at scale we'd batch via a queue,
  -- but for now this is fine for any plausible user count.
  for rec in
    select p.id, p.credit_balance
    from public.profiles p
    where p.subscription_tier = 'free'
      and not exists (
        select 1 from public.credit_ledger cl
        where cl.user_id = p.id
          and cl.reason = 'daily_free_refresh'
          and cl.created_at > now() - interval '23 hours'
      )
    limit 5000
  loop
    -- Append-only ledger entry (hard rule #4 · never mutate balance
    -- without a ledger row).
    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, ref_type, metadata
    ) values (
      rec.id,
      50,
      rec.credit_balance + 50,
      'daily_free_refresh',
      'cron',
      jsonb_build_object('granted_at', now())
    );

    update public.profiles
    set credit_balance = credit_balance + 50,
        updated_at = now()
    where id = rec.id;

    v_count := v_count + 1;
    v_total := v_total + 50;
  end loop;

  return query select v_count, v_total;
end;
$$;

revoke execute on function public.grant_daily_free_credits() from public, anon, authenticated;
grant execute on function public.grant_daily_free_credits() to service_role;

-- 3. Schedule daily at 00:00 UTC (08:00 HKT · 16:00 PT) — pick a time
--    that minimally affects active gameplay.
--    Using cron.schedule with idempotent name; on re-run of migration
--    we drop+re-add to update schedule cleanly.
do $$
begin
  -- Drop any existing job with this name (idempotent re-apply)
  perform cron.unschedule(jobid) from cron.job where jobname = 'daily-free-credits';
exception when others then null;
end;
$$;

select cron.schedule(
  'daily-free-credits',
  '0 0 * * *',                                 -- daily at 00:00 UTC
  $$select public.grant_daily_free_credits();$$
);

comment on function public.grant_daily_free_credits is
  'Daily 50-credit refresh for free-tier users. Called by pg_cron job daily-free-credits (00:00 UTC). Idempotent via 23h window check against credit_ledger.';
