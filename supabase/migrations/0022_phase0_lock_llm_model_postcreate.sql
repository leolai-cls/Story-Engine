-- Migration 0022 · Phase 0 audit wave 4 · column protection on llm_model
-- =========================================================================
-- AUDIT FIX P0AW4-CRIT-01:
--   playthroughs.llm_model is the source of truth for which LLM the turn
--   route dispatches. Authenticated users can update it via direct RLS
--   write (`supabase.from('playthroughs').update({llm_model:'gpt-4o'})`),
--   bypassing tier gates that existed at creation.
--
--   Attack vector: Free user sets llm_model to a paid-tier model id
--   (gpt-4o, claude-opus-4-7, etc.) via browser console → turn route
--   streams premium model output while user pays $0/month subscription.
--
-- CLAUDE.md hard rule #15 corollary: locked-at-creation fields need
-- column-level protection · RLS `with check` alone insufficient because
-- it permits the column write even if min_tier mismatch.
--
-- Fix: BEFORE UPDATE trigger rejects any change to llm_model unless the
-- operation is run by service_role (Stripe webhook · admin tools).
-- Caller wanting to "switch model mid-playthrough" must create a NEW
-- playthrough (CLAUDE.md: "Model selection locked at story creation ·
-- not switchable mid-game").
--
-- Same migration shipped via MCP apply_migration · this file is the
-- canonical record in supabase/migrations/.
-- =========================================================================

create or replace function public.protect_playthrough_llm_model()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Allow service_role to bypass (Stripe webhook · backfills · admin scripts).
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or current_user = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  -- Reject any change to llm_model or llm_provider after creation.
  if new.llm_model is distinct from old.llm_model then
    raise exception
      'llm_model is locked at playthrough creation · cannot be changed mid-game (hard rule #15 corollary)';
  end if;
  if new.llm_provider is distinct from old.llm_provider then
    raise exception
      'llm_provider is locked at playthrough creation · cannot be changed mid-game';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_playthrough_llm_model on public.playthroughs;
create trigger trg_protect_playthrough_llm_model
  before update on public.playthroughs
  for each row
  execute function public.protect_playthrough_llm_model();

-- =========================================================================
-- Sanity (run after apply):
--   -- Verify trigger present
--   select tgname from pg_trigger
--   where tgrelid = 'public.playthroughs'::regclass
--     and tgname = 'trg_protect_playthrough_llm_model';
--
--   -- Verify rejection on direct-write attempt (run as authenticated user):
--   update public.playthroughs set llm_model='gpt-4o' where id=...;
--   -- Expected: ERROR · llm_model is locked at playthrough creation
-- =========================================================================
