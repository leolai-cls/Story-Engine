-- Migration 0031 · Remove duplicate pg_cron job created in 0029
-- ==============================================================
-- Audit Wave 1 found: Migration 0029 created pg_cron job
-- 'daily-free-credits' but the project already had a Vercel cron at
-- /api/cron/refresh-free-credits firing at the same schedule (0 0 * * *)
-- which calls the canonical refresh_free_tier_credits() RPC.
--
-- Two cron jobs racing on the same table would double-grant credits.
-- Drop the pg_cron schedule + the redundant function. Keep
-- apply_billing_credit() (created in 0030) since Stripe webhook paths
-- need it.
--
-- Source-of-truth note (Session 16 CRIT-01): committed retroactively
-- to repo from prod migration history on 2026-05-28.
-- ==============================================================

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'daily-free-credits';
exception when others then null;
end;
$$;

drop function if exists public.grant_daily_free_credits();

comment on function public.apply_billing_credit(uuid, integer, text, text, text, jsonb) is
  'Atomic credit grant for Stripe webhook (subscription renewal · top-up). Idempotent via metadata.idempotency_key. service_role only. Daily free refresh is handled by refresh_free_tier_credits() called from Vercel cron /api/cron/refresh-free-credits.';
