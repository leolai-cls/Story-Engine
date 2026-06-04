-- Migration 0059 · Deep Mode · NPC 內心戲 tier-gate → Pro (adventurer+)
-- =========================================================================
-- Updates the npc_l3_enabled tier-gate trigger from the old 4-tier rule
-- (storyteller / legend only · migration 0028) to the current 2-tier model:
-- NPC 內心戲 is a Pro-tier feature, and Pro unlocks at the `adventurer`
-- subscription (TIER_GATE.pro in web/src/lib/ai/models.ts).
--
-- WHY: light-core collapsed the catalog to Standard + Pro. The old gate
-- (storyteller/legend) no longer maps to any purchasable tier, so the DB-side
-- defense-in-depth check was unreachable-by-design (would block every paying
-- user). This realigns it with the app-layer gate (turn route userIsPro +
-- setNpcL3Enabled getActiveTier >= adventurer).
--
-- Only `free` is now blocked. service_role still bypasses (admin / webhook /
-- backfill). Idempotent: create-or-replace function + re-attach trigger.
--
-- REQUIRES: 0028 (function + trigger + column already exist)
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

  -- Look up user's subscription_tier (raw column · defense-in-depth · the
  -- app-layer gate uses getActiveTier for the active-subscription truth).
  select subscription_tier into v_subscription_tier
  from public.profiles
  where id = new.user_id;

  if v_subscription_tier is null then
    raise exception 'NPC 內心戲 requires a Pro subscription · user profile missing';
  end if;

  -- Pro = adventurer / storyteller / legend (TIER_GATE.pro = adventurer).
  -- Only `free` is blocked.
  if v_subscription_tier not in ('adventurer', 'storyteller', 'legend') then
    raise exception
      'NPC 內心戲 requires a Pro subscription · you are on % tier', v_subscription_tier;
  end if;

  return new;
end;
$$;

-- Re-attach the trigger (idempotent · same binding as 0028).
drop trigger if exists trg_npc_l3_tier_gate on public.playthroughs;
create trigger trg_npc_l3_tier_gate
  before insert or update of npc_l3_enabled on public.playthroughs
  for each row
  execute function public.enforce_npc_l3_tier_gate();

-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- Function now gates at adventurer+ (only free blocked)
--   select prosrc ~ 'adventurer' as gates_pro
--   from pg_proc where proname='enforce_npc_l3_tier_gate';
--
--   -- Trigger still present
--   select tgname from pg_trigger
--   where tgrelid='public.playthroughs'::regclass
--     and tgname='trg_npc_l3_tier_gate';
--
--   -- A free user UPDATE should raise; an adventurer+ user should pass.
-- =========================================================================
