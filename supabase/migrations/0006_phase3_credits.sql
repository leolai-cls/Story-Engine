-- Migration 0006 — Phase 3 Credits + Phase 4 Subscriptions foundation
--
-- Adds:
--   - credit_ledger (append-only) — every credit movement
--   - subscriptions — Stripe sync table
--   - apply_credit_charge RPC — atomic balance update + ledger insert
--   - Additional token-tracking columns on turns + memory_summaries
--   - Indexes for fast balance lookups
--
-- Per CLAUDE.md hard rule #4: "Credits 計算邏輯要絕對啱". This migration
-- enforces append-only ledger via RLS (no INSERT/UPDATE/DELETE by users)
-- and routes all balance changes through SECURITY DEFINER RPC.
--
-- REQUIRES: 0001-0005 applied.


-- ============================================================================
-- credit_ledger — append-only credit movement log
-- ----------------------------------------------------------------------------
-- Every credit change (charge for turn / story / refund / subscription grant
-- / top-up / admin adjust) writes a row here. balance_after captures the
-- running balance for instant per-user audit without a window function.
-- ============================================================================
create table if not exists public.credit_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in (
    'turn_charge', 'story_charge', 'embed_charge',
    'sub_grant', 'topup', 'refund', 'admin_adjust',
    'free_tier_refresh', 'sub_renewal', 'sub_canceled'
  )),
  ref_type text check (ref_type in ('turn', 'story', 'subscription', 'topup', 'admin', null)),
  ref_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx
  on public.credit_ledger (user_id, created_at desc);


-- ============================================================================
-- subscriptions — Stripe sync (one active sub per user)
-- ----------------------------------------------------------------------------
-- Webhook writes here on subscription.created / .updated / .deleted /
-- invoice.payment_succeeded events. App reads to know current tier + period.
-- UNIQUE on user_id means one active subscription per user; row stays after
-- cancellation but status flips to 'canceled'.
-- ============================================================================
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  tier text not null check (tier in ('adventurer', 'storyteller', 'legend')),
  status text not null check (status in (
    'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before insert or update on public.subscriptions
  for each row execute function public.set_updated_at();


-- ============================================================================
-- stripe_webhook_events — idempotency log
-- ----------------------------------------------------------------------------
-- Webhook handler inserts event.id here BEFORE processing. UNIQUE conflict
-- means already-processed (Stripe retries are common). Drop the duplicate.
-- ============================================================================
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb
);


-- ============================================================================
-- Extra token-tracking columns
-- ----------------------------------------------------------------------------
-- Phase 2 background work (lorebook + summarizer) wasn't captured in turn
-- token accounting. P2-UX-M-12 audit fix.
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='turns' and column_name='lorebook_input_tokens') then
    alter table public.turns add column lorebook_input_tokens integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='turns' and column_name='lorebook_output_tokens') then
    alter table public.turns add column lorebook_output_tokens integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='turns' and column_name='cached_input_tokens') then
    alter table public.turns add column cached_input_tokens integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='turns' and column_name='embed_tokens') then
    alter table public.turns add column embed_tokens integer;
  end if;
end $$;

-- memory_summaries: capture Haiku rollup token cost (Phase 4 billing prereq)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='memory_summaries' and column_name='input_tokens') then
    alter table public.memory_summaries add column input_tokens integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='memory_summaries' and column_name='output_tokens') then
    alter table public.memory_summaries add column output_tokens integer;
  end if;
end $$;


-- ============================================================================
-- apply_credit_charge — atomic balance update + ledger insert RPC
-- ----------------------------------------------------------------------------
-- Centralized credit movement entry point. SECURITY DEFINER so it can write
-- to profiles.credit_balance + credit_ledger atomically without RLS blocking
-- non-admin paths.
--
-- Input:
--   p_user_id    — uuid (user to charge / credit)
--   p_delta      — signed int (negative = charge, positive = grant/refund)
--   p_reason     — one of the ledger reason values
--   p_ref_type   — 'turn' / 'story' / 'subscription' / 'topup' / 'admin' / null
--   p_ref_id     — uuid linking back to source row, null for non-row events
--   p_metadata   — jsonb extra detail
--
-- Returns: table(new_balance integer, ledger_id uuid)
--
-- Raises exception 'insufficient_credits' if delta < 0 would push balance < 0.
--
-- Locks profiles row via FOR UPDATE to serialize concurrent charges.
-- ============================================================================
create or replace function public.apply_credit_charge(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_type text default null,
  p_ref_id uuid default null,
  p_metadata jsonb default null
)
returns table (new_balance integer, ledger_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
begin
  if p_delta = 0 then
    raise exception 'apply_credit_charge: delta cannot be 0';
  end if;

  -- Lock the row so concurrent charges serialize cleanly.
  select credit_balance into v_current_balance
    from public.profiles
    where id = p_user_id
    for update;

  if v_current_balance is null then
    raise exception 'apply_credit_charge: profile not found for user %', p_user_id;
  end if;

  v_new_balance := v_current_balance + p_delta;

  if v_new_balance < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('current=%s delta=%s would_be=%s', v_current_balance, p_delta, v_new_balance);
  end if;

  -- Update balance
  update public.profiles
    set credit_balance = v_new_balance
    where id = p_user_id;

  -- Insert ledger row
  insert into public.credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id, metadata)
    values (p_user_id, p_delta, v_new_balance, p_reason, p_ref_type, p_ref_id, p_metadata)
    returning id into v_ledger_id;

  new_balance := v_new_balance;
  ledger_id := v_ledger_id;
  return next;
end;
$$;

grant execute on function public.apply_credit_charge(uuid, integer, text, text, uuid, jsonb) to authenticated;
-- service_role bypasses grant; explicit grant for clarity in webhook handler:
grant execute on function public.apply_credit_charge(uuid, integer, text, text, uuid, jsonb) to service_role;


-- ============================================================================
-- RLS — credit_ledger + subscriptions + stripe_webhook_events
-- ----------------------------------------------------------------------------
-- credit_ledger: read-own only. INSERT/UPDATE/DELETE blocked from user
-- (CLAUDE.md hard rule: append-only ledger, all writes via RPC).
-- subscriptions: read-own only. All writes via service_role (webhook handler).
-- stripe_webhook_events: service_role only.
-- ============================================================================
alter table public.credit_ledger          enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.stripe_webhook_events  enable row level security;

drop policy if exists "credit_ledger_own_select" on public.credit_ledger;
create policy "credit_ledger_own_select" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies on credit_ledger — only SECURITY DEFINER
-- functions (apply_credit_charge) can write. Even service_role goes through
-- the RPC so the invariant balance_after = sum(deltas) is preserved.

drop policy if exists "subscriptions_own_select" on public.subscriptions;
create policy "subscriptions_own_select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- subscriptions writes: service_role only (webhook handler) — no user policy.

-- stripe_webhook_events: service_role only — no user policy at all
-- (PostgREST default behavior with RLS enabled + no policy = deny).


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'apply_credit_charge'
  ) then
    raise exception 'apply_credit_charge RPC not created';
  end if;
  if not exists (
    select 1 from pg_tables where tablename = 'credit_ledger'
  ) then
    raise exception 'credit_ledger table not created';
  end if;
  if not exists (
    select 1 from pg_tables where tablename = 'subscriptions'
  ) then
    raise exception 'subscriptions table not created';
  end if;
end $$;
