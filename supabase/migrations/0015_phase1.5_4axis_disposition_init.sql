-- Migration 0015 — Phase 1.5/2 audit-deferred polish: 4-axis disposition init
--
-- The fork_story_to_playthrough RPC (Migration 0009) initialized only the
-- `trust` axis of each NPC's disposition jsonb. Narrator's
-- update_character_disposition tool emits updates on `trust`, `romance`,
-- `respect`, `fear` (the 4 standard axes) plus story-specific axes
-- (loyalty, envy, etc).
--
-- Pre-fix: when Narrator emitted `{character: X, axis: 'romance', delta: +10}`
-- on turn 1, the merge logic added 10 to romance starting from undefined ·
-- working but messy. UI rendering disposition jsonb would show only `trust`
-- until romance/respect/fear were touched.
--
-- This migration seeds all 4 standard axes explicitly. Story-specific axes
-- still added on-demand by Director / Narrator.
--
-- Matches `dispositionFromDefault()` in web/src/app/[locale]/stories/new/actions.ts
-- (changed in same commit) — keep two sources of truth in sync.
--
-- REQUIRES: 0001-0014 applied.


-- ============================================================================
-- Update fork_story_to_playthrough RPC — 4-axis init
-- ============================================================================
create or replace function public.fork_story_to_playthrough(
  p_story_id uuid,
  p_character_name text default null,
  p_llm_model text default null
)
returns table (playthrough_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_caller_uid uuid;
  v_story record;
  v_initial_state jsonb;
  v_pt_id uuid;
  v_field jsonb;
  v_char record;
  v_disposition_value integer;
begin
  v_caller_uid := auth.uid();
  if v_caller_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Story must exist + be public OR owned by caller
  select id, owner_id, visibility, state_schema
    into v_story
    from public.stories
    where id = p_story_id;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  if v_story.visibility <> 'public' and v_story.owner_id <> v_caller_uid then
    raise exception 'story_not_accessible' using errcode = '42501';
  end if;

  -- Build initial state from schema defaults
  v_initial_state := '{}'::jsonb;
  if v_story.state_schema ? 'fields' then
    for v_field in select * from jsonb_array_elements(v_story.state_schema->'fields')
    loop
      v_initial_state := v_initial_state || jsonb_build_object(
        v_field->>'key',
        v_field->'default'
      );
    end loop;
  end if;

  -- Insert playthrough (turn_count starts at 1 — opening narrative = turn 0)
  insert into public.playthroughs (
    user_id, story_id, character_name, current_state,
    llm_provider, llm_model, turn_count, status
  )
  values (
    v_caller_uid,
    p_story_id,
    coalesce(p_character_name, '主角'),
    v_initial_state,
    'anthropic',
    coalesce(p_llm_model, 'claude-sonnet-4-6'),
    1,
    'active'
  )
  returning id into v_pt_id;

  -- Initialize per-character disposition states from defaults — Phase 1.5/2
  -- polish: seed all 4 standard axes (trust mapped from enum · romance/respect/
  -- fear at 0). Predictable {trust, romance, respect, fear} starting state.
  for v_char in
    select id, default_disposition_toward_protagonist
      from public.story_characters
      where story_id = p_story_id
  loop
    v_disposition_value := case v_char.default_disposition_toward_protagonist
      when 'hostile' then -60
      when 'wary' then -20
      when 'neutral' then 0
      when 'friendly' then 30
      when 'warm' then 60
      when 'devoted' then 90
      else 0
    end;
    insert into public.playthrough_character_states (
      playthrough_id, character_id, disposition, permanent_flags
    )
    values (
      v_pt_id,
      v_char.id,
      jsonb_build_object(
        'trust', v_disposition_value,
        'romance', 0,
        'respect', 0,
        'fear', 0
      ),
      array[]::text[]
    );
  end loop;

  -- Insert opening narrative as turn 0 (copies from stories.opening_narrative)
  insert into public.turns (
    playthrough_id, turn_index, role, text, llm_provider, model, credits_charged
  )
  select v_pt_id, 0, 'ai', s.opening_narrative, 'anthropic',
         coalesce(p_llm_model, 'claude-sonnet-4-6'), 0
    from public.stories s
    where s.id = p_story_id and s.opening_narrative is not null;

  playthrough_id := v_pt_id;
  return next;
end;
$$;

grant execute on function public.fork_story_to_playthrough(uuid, text, text) to authenticated;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'fork_story_to_playthrough'
      and prosrc like '%''romance'', 0%'
  ) then
    raise exception 'fork_story_to_playthrough missing 4-axis init';
  end if;
end $$;
