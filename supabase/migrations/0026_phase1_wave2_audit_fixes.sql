-- Migration 0026 · Phase 1 Wave 2 · audit-fix hotfixes
-- =========================================================================
-- AUDIT FINDINGS · Phase 1 Wave 1 (2026-05-25):
--
-- F-01 (HIGH · Security/Correctness)
--   protect_lorebook_wing (0023) + protect_playthrough_llm_model (0022)
--   use `current_setting('request.jwt.claim.role')` (singular · dot-notation).
--   This is the deprecated GoTrue v1 setting · PostgREST never emits it today.
--   The canonical pattern (used in 0002 + 0007) is
--   `current_setting('request.jwt.claims', true)::jsonb->>'role'`.
--
--   The session-role check (`current_user IN ('service_role', 'postgres')`)
--   still saves us · so this is defense-in-depth + future-proofing, not
--   an active break. But the broken JWT-claim line is dead code today
--   and confusing to maintainers. Fix to canonical pattern.
--
-- F-02 (HIGH · Correctness)
--   apply_npc_dynamic_state (0024) trajectory trim uses
--   `select jsonb_array_elements(v_trajectory) offset N` with no ORDER BY.
--   SQL standard considers OFFSET-without-ORDER-BY as ordering-unspecified.
--   Today returns array order via Postgres internal impl · future planner
--   change (parallel SRF) could silently scramble. Replace with
--   jsonb_array_elements WITH ORDINALITY + explicit ORDER BY.
--
-- REQUIRES: 0022 + 0023 + 0024 applied
-- =========================================================================


-- =========================================================================
-- F-01.a · protect_playthrough_llm_model · canonical JWT pattern
-- =========================================================================
create or replace function public.protect_playthrough_llm_model()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
begin
  -- Canonical Supabase pattern (matches Migration 0002 / 0007)
  v_jwt_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );

  -- Allow service_role to bypass (Stripe webhook · backfills · admin scripts)
  if v_jwt_role = 'service_role'
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


-- =========================================================================
-- F-01.b · protect_lorebook_wing · canonical JWT pattern
-- =========================================================================
create or replace function public.protect_lorebook_wing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
begin
  v_jwt_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );

  if v_jwt_role = 'service_role'
     or current_user = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  if new.wing is distinct from old.wing then
    raise exception
      'lorebook wing is locked at drawer creation · cannot be moved across wings (hard rule #15 corollary)';
  end if;

  return new;
end;
$$;


-- =========================================================================
-- F-02 · apply_npc_dynamic_state · trajectory trim with explicit ordering
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
  v_traj_len integer;
begin
  if p_emotional_shift not in ('positive', 'neutral', 'negative') then
    raise exception 'emotional_shift must be positive/neutral/negative · got %', p_emotional_shift;
  end if;
  if length(p_current_mood) > 40 then
    raise exception 'current_mood too long (max 40 chars)';
  end if;
  if length(p_current_goal) > 120 then
    raise exception 'current_goal too long (max 120 chars)';
  end if;
  if length(p_topic_focus) > 60 then
    raise exception 'topic_focus too long (max 60 chars)';
  end if;

  select dynamic_state into v_existing
  from public.playthrough_character_states
  where playthrough_id = p_playthrough_id
    and character_id = p_character_id
  for update;

  if v_existing is null then
    return null;
  end if;

  v_trajectory := coalesce(v_existing -> 'emotional_trajectory', '[]'::jsonb);
  v_trajectory := v_trajectory || jsonb_build_array(
    jsonb_build_object(
      'shift', p_emotional_shift,
      'turn', p_turn_index,
      'mood', p_current_mood
    )
  );

  -- AUDIT FIX F-02: explicit ordinality + ORDER BY · prevents future planner
  -- changes from silently scrambling trajectory order
  v_traj_len := jsonb_array_length(v_trajectory);
  if v_traj_len > 8 then
    v_trajectory := (
      select jsonb_agg(elem order by idx)
      from jsonb_array_elements(v_trajectory) with ordinality as t(elem, idx)
      where idx > v_traj_len - 8
    );
  end if;

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


-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- All 3 functions present + match canonical JWT pattern
--   select proname, prosrc
--   from pg_proc
--   where proname in ('protect_playthrough_llm_model','protect_lorebook_wing','apply_npc_dynamic_state');
--
--   -- Test trajectory trim returns ordered result (smoke test in test DB)
-- =========================================================================
