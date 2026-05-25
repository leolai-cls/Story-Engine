-- Migration 0028 · Phase 1.5 · NPC L3 opt-in flag + tier-gate
-- =========================================================================
-- Per-playthrough toggle for NPC L3 generative agents.
--
-- FOUNDER DECISIONS (Session 12 sign-off):
--   - Q4 opt-in via button click (NOT default ON) · user must explicitly enable
--   - Q1 tier-gate to Storyteller + Legend (NOT free / adventurer)
--   - Q5 ship NOW · npc_l3_enabled flag naturally hidden until subscription
--     purchase available (Money tier · Phase 4 Stripe)
--
-- THREE LAYERS OF DEFENSE (Phase 0 pattern · hard rule #15):
--   1. DB trigger: BEFORE INSERT/UPDATE OF npc_l3_enabled · enforces tier
--   2. Server action: validates tier before write (defense-in-depth)
--   3. UI: button hidden for free/adventurer · "升級 Storyteller 解鎖" upsell
--
-- REQUIRES: 0001 (playthroughs · profiles)
-- =========================================================================


-- =========================================================================
-- 1. Add npc_l3_enabled column to playthroughs
--    Default false (opt-in per founder decision Q4)
-- =========================================================================
alter table public.playthroughs
  add column if not exists npc_l3_enabled boolean not null default false;


-- =========================================================================
-- 2. Tier-gate trigger
--    Enforces that npc_l3_enabled can only be set true by users on
--    Storyteller or Legend subscription_tier.
--    service_role bypasses (admin · Stripe webhook · backfills).
-- =========================================================================
create or replace function public.enforce_npc_l3_tier_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
  v_subscription_tier text;
begin
  -- Canonical JWT pattern (matches Migration 0026 Wave 2 fix)
  v_jwt_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );

  -- service_role bypasses (admin · Stripe webhook · backfills)
  if v_jwt_role = 'service_role'
     or current_user = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  -- Only enforce on transitions to TRUE · false-to-false or true-to-false skip
  if not new.npc_l3_enabled then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.npc_l3_enabled = true and new.npc_l3_enabled = true then
    return new; -- no-op update
  end if;

  -- Look up user's subscription_tier
  select subscription_tier into v_subscription_tier
  from public.profiles
  where id = new.user_id;

  if v_subscription_tier is null then
    raise exception 'NPC L3 requires Storyteller subscription · user profile missing';
  end if;

  if v_subscription_tier not in ('storyteller', 'legend') then
    raise exception
      'NPC L3 requires Storyteller subscription · you are on % tier', v_subscription_tier;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_npc_l3_tier_gate on public.playthroughs;
create trigger trg_npc_l3_tier_gate
  before insert or update of npc_l3_enabled on public.playthroughs
  for each row
  execute function public.enforce_npc_l3_tier_gate();


-- =========================================================================
-- 3. Index for query optimization
--    Turn route reads playthroughs.npc_l3_enabled per turn · partial index
--    only stores enabled-true rows (cheap · most playthroughs default false)
-- =========================================================================
create index if not exists playthroughs_npc_l3_enabled_idx
  on public.playthroughs (id)
  where npc_l3_enabled = true;


-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- Column added with default false
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name='playthroughs' and column_name='npc_l3_enabled';
--
--   -- Trigger present
--   select tgname from pg_trigger
--   where tgrelid='public.playthroughs'::regclass
--     and tgname='trg_npc_l3_tier_gate';
--
--   -- Index present
--   select indexname from pg_indexes
--   where tablename='playthroughs' and indexname='playthroughs_npc_l3_enabled_idx';
--
--   -- Function present + uses canonical JWT pattern
--   select (prosrc ~ 'request\.jwt\.claims') as canonical_jwt
--   from pg_proc where proname='enforce_npc_l3_tier_gate';
--
--   -- Test trigger blocks non-Storyteller user (run as authenticated):
--   --   update playthroughs set npc_l3_enabled=true where id=...;
--   --   Expected: ERROR · NPC L3 requires Storyteller subscription
-- =========================================================================
