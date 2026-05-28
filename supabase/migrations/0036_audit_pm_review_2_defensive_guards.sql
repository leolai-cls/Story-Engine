-- Migration 0036 — Session 16 PM Review #2 defensive guards
-- ===========================================================
-- Two defensive guards surfaced by post-Session-16 audit:
--
-- C-02: refresh_free_tier_credits lost 23-hour ledger window guard.
--   Migration 0029 had it ("not exists ... cl.created_at > now() - 23h"),
--   Migration 0030 kept it in grant_daily_free_credits. Migration 0031
--   dropped grant_daily_free_credits + pointed Vercel cron at 0008's
--   refresh_free_tier_credits — which does NOT have the window guard.
--   Vercel cron is "at least once" semantics. If retry fires after user
--   spent some credits, the floor-to-50 UPDATE silently re-grants.
--   Re-add the 23h window guard so retry within same day is no-op.
--
-- C-03: apply_billing_credit accepts NULL p_idempotency_key.
--   Dedup logic `WHERE metadata->>'idempotency_key' = p_idempotency_key`
--   uses 3-value logic — `x = NULL` is always NULL/false → dedup bypassed
--   if caller ever passes NULL. Today's Stripe callers pass non-null IDs,
--   but defensive validation prevents future regression.
--
-- REQUIRES: 0035 applied.

-- ============================================================================
-- C-02 · refresh_free_tier_credits with 23h ledger window guard
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
  v_new_balance integer;
  v_refreshed integer := 0;
  v_total integer := 0;
begin
  if p_target_balance <= 0 or p_target_balance > 1000 then
    raise exception 'refresh_free_tier_credits: invalid target % (must be 1-1000)', p_target_balance;
  end if;

  for v_user in
    select id, credit_balance
      from public.profiles p
      where subscription_tier = 'free'
        and credit_balance < p_target_balance
        -- C-02 guard: skip users who got a free-tier refresh in the last 23 hours.
        -- Catches Vercel cron retry-after-spend exploit where second invocation
        -- within same day would silently re-grant after user spent credits.
        and not exists (
          select 1 from public.credit_ledger cl
          where cl.user_id = p.id
            and cl.reason = 'free_tier_refresh'
            and cl.created_at > now() - interval '23 hours'
        )
      for update skip locked
  loop
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

revoke execute on function public.refresh_free_tier_credits(integer) from public, anon, authenticated;
grant execute on function public.refresh_free_tier_credits(integer) to service_role;

-- ============================================================================
-- C-03 · apply_billing_credit NULL/empty idempotency key validation
-- ============================================================================
create or replace function public.apply_billing_credit(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_type text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(success boolean, new_balance integer, was_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_new_balance integer;
  v_existing_id uuid;
begin
  -- Validation
  if p_delta <= 0 then
    raise exception 'apply_billing_credit: delta must be positive · got %', p_delta;
  end if;
  if p_reason not in ('sub_grant', 'sub_renewal', 'topup', 'admin_adjust') then
    raise exception 'apply_billing_credit: invalid reason %', p_reason;
  end if;
  -- C-03 guard: idempotency_key must be non-null + non-empty.
  -- SQL 3-value logic (`x = NULL` → NULL/false) would silently bypass dedup
  -- if any caller ever passes NULL. Fail loud at function entry instead.
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'apply_billing_credit: idempotency_key required (got null or empty)';
  end if;

  -- Idempotency check · keyed on (user_id, reason, metadata.idempotency_key)
  select id into v_existing_id
  from public.credit_ledger
  where user_id = p_user_id
    and reason = p_reason
    and metadata->>'idempotency_key' = p_idempotency_key
  limit 1;

  if v_existing_id is not null then
    select credit_balance into v_new_balance from public.profiles where id = p_user_id;
    return query select true, v_new_balance, true;
    return;
  end if;

  -- Atomic increment + ledger write
  update public.profiles
  set credit_balance = credit_balance + p_delta,
      updated_at = now()
  where id = p_user_id
  returning credit_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'apply_billing_credit: profile % not found', p_user_id;
  end if;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, ref_type, metadata
  ) values (
    p_user_id, p_delta, v_new_balance, p_reason, p_ref_type,
    p_metadata || jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  return query select true, v_new_balance, false;
end;
$function$;

revoke execute on function public.apply_billing_credit(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_credit(uuid, integer, text, text, text, jsonb) to service_role;

-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  -- Verify 23h window guard present in refresh_free_tier_credits source
  if not exists (
    select 1 from pg_proc
    where proname = 'refresh_free_tier_credits'
      and prosrc like '%free_tier_refresh%23 hours%'
  ) then
    raise exception '0036: refresh_free_tier_credits 23h ledger guard missing after migration';
  end if;
  -- Verify idempotency null check present in apply_billing_credit
  if not exists (
    select 1 from pg_proc
    where proname = 'apply_billing_credit'
      and prosrc like '%idempotency_key required%'
  ) then
    raise exception '0036: apply_billing_credit null/empty idempotency_key guard missing after migration';
  end if;
end $$;
