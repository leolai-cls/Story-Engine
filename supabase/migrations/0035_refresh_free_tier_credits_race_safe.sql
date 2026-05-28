-- Migration 0035 — Race-safe refresh_free_tier_credits (HIGH-02)
--
-- Wave 2 i18n audit (Session 16 · HIGH-02) showed the cron RPC has a
-- snapshot-vs-UPDATE race:
--
--   FOR v_user IN SELECT id, credit_balance ...  (snapshot)
--     -- user spends credits here in another transaction
--   UPDATE profiles SET credit_balance = p_target_balance  (clobbers)
--
-- Net effect: if user had 30 at snapshot and spent 20 (balance=10) before
-- the UPDATE fires, the UPDATE force-resets to 50 → user got +40 silently
-- instead of +20. Ledger delta is wrong (records +20 not +40).
--
-- Fix: add `FOR UPDATE` to the inner SELECT so each profile row is locked
-- for the duration of the loop iteration. Concurrent turn charges block on
-- the lock until the refresh row commits. Snapshot is now safe.
--
-- Also: skip rows already at-or-above target via the WHERE clause +
-- guard the UPDATE with the same predicate so it's a no-op if a concurrent
-- transaction beat us to it.
--
-- REQUIRES: 0008 applied.

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
  v_new_balance integer;
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
      for update skip locked  -- race fix: hold row lock until iteration commits
  loop
    -- Guard UPDATE with same predicate. If a concurrent transaction grabbed
    -- this row first (shouldn't happen with SKIP LOCKED, but defense in
    -- depth) the UPDATE no-ops and RETURNING is NULL → we skip ledger write.
    update public.profiles
      set credit_balance = p_target_balance,
          updated_at = now()
      where id = v_user.id
        and credit_balance < p_target_balance
      returning credit_balance into v_new_balance;

    if v_new_balance is null then
      continue;
    end if;

    v_delta := p_target_balance - v_user.credit_balance;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, ref_type, ref_id, metadata
    )
    values (
      v_user.id,
      v_delta,
      v_new_balance,
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

-- Re-apply existing grants (no-op if already set, just being explicit).
revoke execute on function public.refresh_free_tier_credits(integer) from public, anon, authenticated;
grant execute on function public.refresh_free_tier_credits(integer) to service_role;
