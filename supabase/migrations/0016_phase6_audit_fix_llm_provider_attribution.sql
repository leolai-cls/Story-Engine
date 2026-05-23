-- Migration 0016 — Phase 6 + 1.5/2 polish audit fix: llm_provider attribution
--
-- P6-HIGH-01: fork_story_to_playthrough RPC hardcoded llm_provider='anthropic'
-- on both the playthrough row + the turn 0 (opening narrative) row. When a
-- user picks the OpenRouter Llama narrator and forks a story, the playthrough
-- + opening turn are mis-stamped as anthropic.
--
-- Impact: analytics by provider mis-attribute Llama traffic to Anthropic ·
-- masks CLAUDE.md hard rule #5 (NSFW LLM isolation) compliance audit ·
-- breaks Phase 4 billing reconciliation vs OpenRouter invoice · future
-- analytics filtering by `llm_provider='openrouter'` returns 0 rows.
--
-- Fix: add p_llm_provider param to fork RPC · default 'anthropic' for back-
-- compat with existing callers · forkStoryToPlaythrough action passes the
-- derived provider from MODELS catalog.
--
-- Mirror fix in code: web/src/lib/community/actions.ts forkStoryToPlaythrough
-- + web/src/app/[locale]/stories/new/actions.ts createStoryFromPrompt
-- (also derive llm_provider from MODELS).
--
-- REQUIRES: 0001-0015 applied.


-- ============================================================================
-- Update fork_story_to_playthrough RPC — accept p_llm_provider param
-- ============================================================================
create or replace function public.fork_story_to_playthrough(
  p_story_id uuid,
  p_character_name text default null,
  p_llm_model text default null,
  p_llm_provider text default 'anthropic'
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

  -- P6-HIGH-01 fix: use caller-supplied provider (derived from MODELS catalog
  -- on the action side · default 'anthropic' for back-compat).
  insert into public.playthroughs (
    user_id, story_id, character_name, current_state,
    llm_provider, llm_model, turn_count, status
  )
  values (
    v_caller_uid,
    p_story_id,
    coalesce(p_character_name, '主角'),
    v_initial_state,
    p_llm_provider,
    coalesce(p_llm_model, 'claude-sonnet-4-6'),
    1,
    'active'
  )
  returning id into v_pt_id;

  -- Phase 1.5/2 polish: 4-axis disposition init
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

  -- P6-HIGH-01 fix: opening narrative turn 0 also uses caller-supplied provider.
  insert into public.turns (
    playthrough_id, turn_index, role, text, llm_provider, model, credits_charged
  )
  select v_pt_id, 0, 'ai', s.opening_narrative, p_llm_provider,
         coalesce(p_llm_model, 'claude-sonnet-4-6'), 0
    from public.stories s
    where s.id = p_story_id and s.opening_narrative is not null;

  playthrough_id := v_pt_id;
  return next;
end;
$$;

-- Grant the new 4-arg signature (3-arg signature still works for legacy callers)
grant execute on function public.fork_story_to_playthrough(uuid, text, text, text) to authenticated;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'fork_story_to_playthrough'
      and prosrc like '%p_llm_provider%'
  ) then
    raise exception 'fork_story_to_playthrough missing p_llm_provider param';
  end if;
end $$;
