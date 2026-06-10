-- Migration 0062 · audit fix · lock playthrough server-managed columns
-- =========================================================================
-- AUDIT FIX (2026-06-08 · product security audit H-1):
--   playthroughs.running_summary / current_state / mention_roster are
--   SERVER-MANAGED columns that get injected VERBATIM into the Narrator
--   system/context prompt every turn. Only the player ACTION is moderated
--   per turn — the stored summary/state/roster is never re-moderated.
--
--   Before this migration, RLS `playthroughs_own_update` (bare auth.uid()=
--   user_id) let an authenticated user UPDATE these on their OWN row via the
--   browser Supabase client. Attack vectors:
--     1. hard rule #5 bypass: stuff attacker-chosen NSFW/disallowed text into
--        running_summary / current_state of a SFW (non-adult) playthrough →
--        sent to ANTHROPIC (Sonnet/Opus) on the next turn, bypassing the
--        input-moderation gate.
--     2. prompt injection / state forgery via current_state / running_summary.
--
--   The ONLY legitimate writers of these columns all use the SERVICE-ROLE
--   client (verified 2026-06-08): the turn route's onFinish persistence (moved
--   to service-role in the same change), the summarizer (running_summary), and
--   undoLastTurn. So a BEFORE UPDATE trigger can safely REVERT any non-service-
--   role change without breaking any real flow.
--
--   We REVERT (not raise) so a legit multi-column update of ALLOWED fields
--   (status / character_name / thinking_mode_enabled / last_played_at /
--   npc_l3_enabled — the latter already tier-gated by 0059) still succeeds.
--
--   turn_count is intentionally NOT locked here (written by the atomic RPC
--   acquire_next_turn_pair + the service-role fallback; forging it only affects
--   the user's own game integrity, low harm) — can be added later if needed.
--
--   ⚠️ DEPLOY ORDERING: apply this AFTER the code change that moves the turn
--   route's playthroughs UPDATE to the service-role client. If applied before,
--   the currently-deployed user-client current_state write would be reverted →
--   state stops persisting. (Code shipped first in the same batch.)
--
-- Separate from 0022's protect_playthrough_llm_model (that one stays as-is and
-- REJECTS llm_model/llm_provider changes). This trigger runs alongside it.
--
-- Same migration shipped via MCP apply_migration · this file is the canonical
-- record in supabase/migrations/.
-- =========================================================================

create or replace function public.protect_playthrough_server_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service-role bypass (turn route persistence · summarizer · undo · backfills).
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or current_user = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  -- Authenticated browser client: silently revert server-managed columns.
  new.running_summary := old.running_summary;
  new.running_summary_through := old.running_summary_through;
  new.current_state := old.current_state;
  new.mention_roster := old.mention_roster;

  return new;
end;
$$;

drop trigger if exists trg_protect_playthrough_server_columns on public.playthroughs;
create trigger trg_protect_playthrough_server_columns
  before update on public.playthroughs
  for each row
  execute function public.protect_playthrough_server_columns();

-- =========================================================================
-- Sanity (run after apply, AS AN AUTHENTICATED USER on your own playthrough):
--   update public.playthroughs set running_summary='HACKED' where id=...;
--   select running_summary from public.playthroughs where id=...;
--   -- Expected: running_summary UNCHANGED (revert worked).
--   -- And a normal turn (service-role) must still persist current_state.
-- =========================================================================
