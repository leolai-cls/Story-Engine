-- Migration 0024 · Phase 1 · NPC Level 2 dynamic state
-- =========================================================================
-- PHASE 1 GOAL · supplement long-term 4-axis disposition (trust / romance /
-- respect / fear) with **transient per-scene** NPC state that Director
-- updates each turn. Solves "AI NPC 講嘢冇 emotional continuity" complaint:
-- Narrator sees NPC's CURRENT mood + goal + topic focus + recent emotional
-- trajectory · narrative grounded in this scene's emotional truth.
--
-- ARCHITECTURE:
--   - Long-term disposition (existing) — 4-axis numeric · changes slowly
--   - Dynamic state (this migration) — transient · refreshed every turn by
--     Director · stores current_mood / current_goal / topic_focus + rolling
--     emotional trajectory (last 8 shifts)
--
-- HARD RULE COMPLIANCE:
--   - #5 Narrative Integrity — Director output controls this · not user-
--     editable directly (RLS lockdown via parent table's existing policies)
--   - #11 prompt cache — dynamic_state is per-turn payload · stays out of
--     cached prefix (already handled by allCharactersDynamicState fn split)
--   - #15 column-level protection — service_role only mutation via new RPC
--
-- REQUIRES: 0001 (playthrough_character_states table) applied
-- =========================================================================


-- =========================================================================
-- 1. Add dynamic_state jsonb column to playthrough_character_states
--    Default empty object · existing rows backfill with {} · no break
-- =========================================================================
alter table public.playthrough_character_states
  add column if not exists dynamic_state jsonb not null default '{}'::jsonb;


-- =========================================================================
-- 2. Defensive schema check · ensure dynamic_state is always an object
--    (NOT array · NOT primitive · NOT null) so app code can always do
--    safe key access without defensive coding
-- =========================================================================
alter table public.playthrough_character_states
  drop constraint if exists pcs_dynamic_state_is_object;

alter table public.playthrough_character_states
  add constraint pcs_dynamic_state_is_object check (
    jsonb_typeof(dynamic_state) = 'object'
  );


-- =========================================================================
-- 3. RPC: apply_npc_dynamic_state
--    Atomic helper · Director output → merged into dynamic_state · rolling
--    emotional_trajectory append (max 8 entries) · last_updated_turn stamp.
--
--    Why RPC not direct UPDATE:
--      - Atomicity: rolling trajectory append must be race-safe
--      - Validation: emotional_shift must be in enum
--      - Auditability: single function = single audit surface
--      - Server-only: SECURITY DEFINER · authenticated role can't write
--        directly (RLS lockdown remains)
-- =========================================================================
create or replace function public.apply_npc_dynamic_state(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_current_mood text,
  p_current_goal text,
  p_topic_focus text,
  p_emotional_shift text,
  p_turn_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing jsonb;
  v_trajectory jsonb;
  v_new_state jsonb;
begin
  -- Validate emotional_shift enum
  if p_emotional_shift not in ('positive', 'neutral', 'negative') then
    raise exception 'emotional_shift must be positive/neutral/negative · got %', p_emotional_shift;
  end if;

  -- Length guards (defense in depth · Zod also validates at app layer)
  if length(p_current_mood) > 40 then
    raise exception 'current_mood too long (max 40 chars)';
  end if;
  if length(p_current_goal) > 120 then
    raise exception 'current_goal too long (max 120 chars)';
  end if;
  if length(p_topic_focus) > 60 then
    raise exception 'topic_focus too long (max 60 chars)';
  end if;

  -- Fetch existing dynamic_state (row lock so concurrent same-character
  -- updates serialize correctly — won't happen in normal flow but defensive)
  select dynamic_state into v_existing
  from public.playthrough_character_states
  where playthrough_id = p_playthrough_id
    and character_id = p_character_id
  for update;

  if v_existing is null then
    -- Character state row doesn't exist · skip (Director shouldn't have
    -- emitted update for non-existent NPC · safety net only)
    return null;
  end if;

  -- Rolling trajectory: append new shift · keep last 8
  v_trajectory := coalesce(v_existing -> 'emotional_trajectory', '[]'::jsonb);
  v_trajectory := v_trajectory || jsonb_build_array(
    jsonb_build_object(
      'shift', p_emotional_shift,
      'turn', p_turn_index,
      'mood', p_current_mood
    )
  );
  -- Trim to last 8 entries · jsonb_array_length + slice
  if jsonb_array_length(v_trajectory) > 8 then
    v_trajectory := (
      select jsonb_agg(elem)
      from (
        select jsonb_array_elements(v_trajectory) as elem
        offset jsonb_array_length(v_trajectory) - 8
      ) sub
    );
  end if;

  -- Build new dynamic_state · keep any other fields the app may have added
  v_new_state := v_existing
    || jsonb_build_object(
      'current_mood', p_current_mood,
      'current_goal', p_current_goal,
      'topic_focus', p_topic_focus,
      'last_emotional_shift', p_emotional_shift,
      'last_updated_turn', p_turn_index,
      'emotional_trajectory', v_trajectory
    );

  update public.playthrough_character_states
  set dynamic_state = v_new_state
  where playthrough_id = p_playthrough_id
    and character_id = p_character_id;

  return v_new_state;
end;
$$;

-- Grant: service_role only (turn route uses service-role client per the
-- Phase 5 W1-MOD-C-01 / Phase 2 0018 lockdown pattern · authenticated
-- can't write memory layers directly)
revoke execute on function public.apply_npc_dynamic_state(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_npc_dynamic_state(uuid, uuid, text, text, text, text, integer) to service_role;


-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- Column + default + constraint
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'playthrough_character_states'
--     and column_name = 'dynamic_state';
--
--   -- Check constraint present
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'pcs_dynamic_state_is_object';
--
--   -- RPC present + service-only grant
--   select proname, proacl
--   from pg_proc
--   where proname = 'apply_npc_dynamic_state';
-- =========================================================================
