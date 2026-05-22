-- Migration 0008 — Phase 3 Wave 3: Credit lifecycle (initial grant + daily refresh)
--
-- Addresses Phase 3 audit:
--   - P3-BILL-H-11 Free tier daily refresh mechanism didn't exist
--   - Audit trail gap: initial 50 credits had no ledger row
--
-- Two pieces:
--   1. handle_new_user trigger writes a ledger row for the 50-credit
--      signup grant (so audit trail starts at signup, not turn 1).
--   2. refresh_free_tier_credits() RPC — called by Vercel cron daily —
--      tops up free-tier users to 50 credits (no daily accumulation,
--      just resets the floor).
--
-- REQUIRES: 0001-0007 applied.


-- ============================================================================
-- handle_new_user — initial grant ledger row
-- ----------------------------------------------------------------------------
-- Replaces 0001's trigger function. Profile creation now writes a parallel
-- ledger row so balance history starts at signup. exception handler keeps
-- existing idempotency (P3-LOGIC-M-11 / DB-C-02).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Profile insert (default credit_balance = 50 via column default)
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      new.email
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );

  -- Ledger row for the signup grant. Reason = 'sub_grant' (free tier
  -- counts as an implicit subscription grant of 50 credits).
  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, ref_type, ref_id, metadata
  )
  values (
    new.id, 50, 50, 'sub_grant', null, null,
    jsonb_build_object('source', 'signup_initial_grant', 'tier', 'free')
  );

  return new;
exception
  when unique_violation then
    -- Already exists (rare duplicate-trigger case). Treat as no-op.
    return new;
  when others then
    -- Don't block sign-up if ledger insert fails for an obscure reason
    -- (e.g., credit_ledger doesn't exist yet during migration ordering
    -- in test environments). Log + continue.
    raise warning '[handle_new_user] grant ledger insert failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;


-- ============================================================================
-- refresh_free_tier_credits — daily cron entry point
-- ----------------------------------------------------------------------------
-- Tops every free-tier user up to `p_target_balance` (default 50). NOT
-- additive — users who let their balance accumulate above target keep what
-- they have. Users who burned credits get refilled.
--
-- Decision: top-up not reset, because paid users on free-fallback period
-- (subscription canceled but balance not yet zero) shouldn't lose their
-- remaining credits.
--
-- Idempotent: running twice in one day = second run finds balance already
-- at target, no ledger churn. Throttling via Vercel cron schedule.
--
-- Called by /api/cron/refresh-free-credits with service-role JWT.
-- ============================================================================
create or replace function public.refresh_free_tier_credits(
  p_target_balance integer default 50
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
  v_delta integer;
  v_refreshed integer := 0;
  v_total integer := 0;
begin
  if p_target_balance <= 0 or p_target_balance > 1000 then
    raise exception 'refresh_free_tier_credits: invalid target % (must be 1-1000)', p_target_balance;
  end if;

  for v_user in
    select id, credit_balance
      from public.profiles
      where subscription_tier = 'free'
        and credit_balance < p_target_balance
  loop
    v_delta := p_target_balance - v_user.credit_balance;

    update public.profiles
      set credit_balance = p_target_balance
      where id = v_user.id;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, ref_type, ref_id, metadata
    )
    values (
      v_user.id,
      v_delta,
      p_target_balance,
      'free_tier_refresh',
      null,
      null,
      jsonb_build_object('target', p_target_balance, 'refreshed_at', now())
    );

    v_refreshed := v_refreshed + 1;
    v_total := v_total + v_delta;
  end loop;

  refreshed_count := v_refreshed;
  total_credits_granted := v_total;
  return next;
end;
$$;

-- Restrict to service_role only — cron route authenticates with service key.
revoke execute on function public.refresh_free_tier_credits(integer) from public, anon, authenticated;
grant execute on function public.refresh_free_tier_credits(integer) to service_role;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'refresh_free_tier_credits'
  ) then
    raise exception 'refresh_free_tier_credits RPC not created';
  end if;
end $$;
