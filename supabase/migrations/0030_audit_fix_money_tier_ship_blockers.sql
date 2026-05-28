-- Migration 0030 · Post-Phase-4/6 audit ship-blocker fixes
-- =========================================================
-- Audit found (Wave 1 · 2026-05-27):
--   🔴 D7/B3: code wrote reason='monthly_subscription_grant'/'topup_purchase'
--             /'daily_free_refresh' + ref_type='stripe_invoice'/'stripe_session'
--             /'cron' · NONE in CHECK enum → every credit grant since deploy
--             rolled back. Confirmed by 0 rows in credit_ledger for these
--             reasons.
--   🔴 A1: subscriptions.user_id UNIQUE blocks resubscribe (Stripe issues
--          new stripe_subscription_id when user resubscribes after cancel
--          → INSERT 23505 → webhook 500 → infinite retry).
--   🔴 B1: All grant paths use SELECT-compute-INSERT-UPDATE race. Need
--          atomic increment + DB-level idempotency.
--   🟠 D2: profiles.subscription_tier has no CHECK · typo in webhook would
--          silently break entitlement.
--
-- Strategy
--   1. Drop unique on subscriptions.user_id · keep stripe_subscription_id UNIQUE
--   2. Add expression indexes for ledger idempotency lookups
--   3. Add subscription_tier CHECK on profiles
--   4. Replace grant_daily_free_credits with atomic UPDATE RETURNING pattern
--      using the proper reason 'free_tier_refresh' + ref_type 'subscription'
--      (closest matching enum value · 'admin' was the only alternative)
--
-- Source-of-truth note (Session 16 CRIT-01): this file was applied via
-- Supabase MCP on 2026-05-27 but not committed at the time. Reconstructed
-- from prod supabase_migrations.schema_migrations on 2026-05-28.
-- =========================================================

-- 1. Drop subscriptions.user_id UNIQUE — was blocking resubscribe
alter table public.subscriptions
  drop constraint if exists subscriptions_user_id_key;

-- Add a non-unique index so user_id lookups stay fast
create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id, created_at desc);

-- 2. Expression indexes for idempotency lookups (jsonb path queries)
create index if not exists credit_ledger_invoice_idx
  on public.credit_ledger ((metadata->>'invoice_id'))
  where reason in ('sub_renewal', 'sub_grant');

create index if not exists credit_ledger_session_idx
  on public.credit_ledger ((metadata->>'session_id'))
  where reason = 'topup';

-- 3. profiles.subscription_tier CHECK constraint (hard rule #15 corollary)
alter table public.profiles
  drop constraint if exists profiles_subscription_tier_check;
alter table public.profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'adventurer', 'storyteller', 'legend'));

-- 4. Rewrite grant_daily_free_credits — atomic UPDATE RETURNING + correct enum
create or replace function public.grant_daily_free_credits()
returns table (granted_user_count integer, granted_credits integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_total integer := 0;
  v_new_balance integer;
  rec record;
begin
  for rec in
    select p.id
    from public.profiles p
    where p.subscription_tier = 'free'
      and not exists (
        select 1 from public.credit_ledger cl
        where cl.user_id = p.id
          and cl.reason = 'free_tier_refresh'
          and cl.created_at > now() - interval '23 hours'
      )
    limit 5000
    for update skip locked
  loop
    -- Atomic: UPDATE first · use RETURNING to capture the new balance ·
    -- then write the ledger row with that exact value. This eliminates
    -- the read-then-write race (B1 audit finding).
    update public.profiles
    set credit_balance = credit_balance + 50,
        updated_at = now()
    where id = rec.id
    returning credit_balance into v_new_balance;

    insert into public.credit_ledger (
      user_id, delta, balance_after, reason, ref_type, metadata
    ) values (
      rec.id,
      50,
      v_new_balance,
      'free_tier_refresh',
      null,                                       -- no ref_type · system grant
      jsonb_build_object('granted_at', now(), 'source', 'pg_cron')
    );

    v_count := v_count + 1;
    v_total := v_total + 50;
  end loop;

  return query select v_count, v_total;
end;
$$;

revoke execute on function public.grant_daily_free_credits() from public, anon, authenticated;
grant execute on function public.grant_daily_free_credits() to service_role;

comment on function public.grant_daily_free_credits is
  'Daily 50-credit refresh for free-tier users. Atomic UPDATE RETURNING + ledger insert. Idempotent via 23h window check. Called by pg_cron job daily-free-credits at 00:00 UTC.';

-- 5. Helper RPC for service-role webhook grants (atomic · idempotent)
-- Used by Stripe webhook to grant monthly subscription credits + top-up credits.
create or replace function public.apply_billing_credit(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_type text,
  p_idempotency_key text,                       -- e.g. invoice.id or session.id
  p_metadata jsonb default '{}'::jsonb
)
returns table (success boolean, new_balance integer, was_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke execute on function public.apply_billing_credit(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_credit(uuid, integer, text, text, text, jsonb) to service_role;

comment on function public.apply_billing_credit is
  'Atomic credit grant for Stripe webhook (subscription renewal / top-up). Idempotent via metadata.idempotency_key. Use service_role only.';
