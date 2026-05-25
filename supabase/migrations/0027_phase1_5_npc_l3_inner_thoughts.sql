-- Migration 0027 · Phase 1.5 · NPC L3 Inner Thoughts (Storyteller tier exclusive)
-- =========================================================================
-- PHASE 1.5 GOAL · NPC Level 3 generative agent layer.
-- Each active NPC (max 3 per turn) spawns a parallel Haiku-tier agent call
-- that emits its own POV inner_thought + intent. Narrator integrates all
-- POVs into one canonical narrative + state_delta. Storyteller subscription
-- tier exclusive · per-NPC credit charge covers cost overhead.
--
-- Three layers of NPC system (now complete):
--   L1 disposition (Migration 0001 · 4-axis trust/romance/respect/fear)
--   L2 dynamic_state (Migration 0024 · mood/goal/topic_focus/trajectory)
--   L3 inner_thought (this migration · POV agent output · MIRROR 3-step CoT)
--
-- ARCHITECTURE (per pm/research-npc-agent-l3.md + npc-l3-implementation-plan.html):
--   - Parallel via Promise.allSettled (max 3 concurrent · 1.8s vs 5.4s sequential)
--   - Each agent uses Standard tier model (tier-router · CJK → GLM-5.1 · EN → Gemini Flash)
--   - POV memory via walk_lorebook_graph filtered to attended/witnessed/located_at
--   - Shallow ToM only (each NPC sees others' L2 dynamic_state · no recursive)
--   - NO synthesizer agent · Narrator is sole integrator
--   - Director verdict canonical · NPC agents only emit POV (cannot change state)
--
-- HARD RULE COMPLIANCE:
--   - #5 Narrative Integrity · F-04 mitigation (skip L3 on verdict=reject)
--   - #11 prompt cache · per-NPC cached prefix (character card · 5-min TTL)
--   - #15 column-level lock · inner_thought / intent immutable post-write
--   - #17 after() background work · embed + persist async
--   - #18 similarity floor · embedding for future retrieval (RAG-grounded)
--
-- REQUIRES: 0001 (profiles · story_characters · playthroughs) · 0004 (pgvector)
--           · 0024 (dynamic_state for L2 reference) · 0025 (mem_edges for POV scope)
-- =========================================================================


-- =========================================================================
-- 1. npc_inner_thoughts table
--    One row per (playthrough, character, turn_index) · canonical agent output
-- =========================================================================
create table if not exists public.npc_inner_thoughts (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  character_id uuid not null references public.story_characters(id) on delete cascade,
  turn_index integer not null,

  -- Agent output (MIRROR 3-step CoT result)
  inner_thought text not null,
  intent text not null,

  -- Reasoning trace · auditable · grounds inner_thought in retrieved memories
  -- {memories_recalled: string[], reactions_predicted: string[], motivation: string}
  reasoning_trace jsonb not null default '{}'::jsonb,

  -- Embedding for future "NPC remembers their own past thought" retrieval
  -- (text-embedding-3-small · 1536-dim · same as turn_embeddings + lorebook_entries)
  embedding extensions.vector(1536),

  -- Which model produced this thought (telemetry · for A/B tuning later)
  model_id text,

  created_at timestamptz not null default now(),

  -- One thought per (playthrough, character, turn) · Director output canonical
  constraint npc_inner_thoughts_unique unique (playthrough_id, character_id, turn_index),

  -- Length guards (defense in depth · Zod also validates app-side)
  constraint npc_inner_thoughts_inner_thought_len check (length(inner_thought) between 20 and 400),
  constraint npc_inner_thoughts_intent_len check (length(intent) between 5 and 200),

  -- reasoning_trace must be JSON object (not array · not primitive)
  constraint npc_inner_thoughts_reasoning_object check (jsonb_typeof(reasoning_trace) = 'object')
);


-- =========================================================================
-- 2. Indexes for retrieval + telemetry
-- =========================================================================
create index if not exists npc_inner_thoughts_playthrough_idx
  on public.npc_inner_thoughts (playthrough_id, turn_index desc);

create index if not exists npc_inner_thoughts_character_idx
  on public.npc_inner_thoughts (character_id, turn_index desc);

-- HNSW index for vector similarity search (mirror lorebook_entries pattern)
create index if not exists npc_inner_thoughts_embedding_idx
  on public.npc_inner_thoughts using hnsw (embedding extensions.vector_cosine_ops);


-- =========================================================================
-- 3. RLS · service-role writes only · user reads own playthrough
--    Mirror Migration 0018 memory lockdown pattern · authenticated cannot
--    INSERT/UPDATE/DELETE to prevent narrative-integrity attack via browser
--    console (fake inner_thought injection to subvert NPC POV).
-- =========================================================================
alter table public.npc_inner_thoughts enable row level security;

drop policy if exists "npc_inner_thoughts_own_select" on public.npc_inner_thoughts;
create policy "npc_inner_thoughts_own_select" on public.npc_inner_thoughts
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

-- NO insert/update/delete policies · service-role only
-- Even if a future authenticated policy was added, REVOKE preempts it.
revoke insert, update, delete on public.npc_inner_thoughts from authenticated, anon;


-- =========================================================================
-- 4. RPC: apply_npc_inner_thought
--    Atomic upsert · service-role only · validates length + types defensively
-- =========================================================================
create or replace function public.apply_npc_inner_thought(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_turn_index integer,
  p_inner_thought text,
  p_intent text,
  p_reasoning_trace jsonb,
  p_embedding extensions.vector(1536),
  p_model_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Defense-in-depth length validation (Zod also validates app-side)
  if length(p_inner_thought) < 20 or length(p_inner_thought) > 400 then
    raise exception 'inner_thought length must be 20-400 chars · got %', length(p_inner_thought);
  end if;
  if length(p_intent) < 5 or length(p_intent) > 200 then
    raise exception 'intent length must be 5-200 chars · got %', length(p_intent);
  end if;
  if jsonb_typeof(p_reasoning_trace) <> 'object' then
    raise exception 'reasoning_trace must be JSON object';
  end if;

  insert into public.npc_inner_thoughts (
    playthrough_id, character_id, turn_index,
    inner_thought, intent, reasoning_trace, embedding, model_id
  ) values (
    p_playthrough_id, p_character_id, p_turn_index,
    p_inner_thought, p_intent, p_reasoning_trace, p_embedding, p_model_id
  )
  on conflict (playthrough_id, character_id, turn_index) do update
    set inner_thought = excluded.inner_thought,
        intent = excluded.intent,
        reasoning_trace = excluded.reasoning_trace,
        embedding = excluded.embedding,
        model_id = excluded.model_id
  returning id into v_id;

  return v_id;
end;
$$;

-- Grant: service_role only · authenticated cannot bypass RLS via direct RPC
revoke execute on function public.apply_npc_inner_thought(
  uuid, uuid, integer, text, text, jsonb, extensions.vector, text
) from public, anon, authenticated;
grant execute on function public.apply_npc_inner_thought(
  uuid, uuid, integer, text, text, jsonb, extensions.vector, text
) to service_role;


-- =========================================================================
-- 5. RPC: match_npc_inner_thoughts (future use · for "NPC remembers" feature)
--    Vector similarity search over a character's past inner_thoughts.
--    Storyteller-tier playthrough only · enforced via RLS on parent table.
-- =========================================================================
create or replace function public.match_npc_inner_thoughts(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5,
  p_min_similarity float default 0.5,
  p_exclude_turn_indexes integer[] default array[]::integer[]
)
returns table (
  id uuid,
  turn_index integer,
  inner_thought text,
  intent text,
  similarity float
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    nit.id,
    nit.turn_index,
    nit.inner_thought,
    nit.intent,
    1 - (nit.embedding <=> p_query_embedding) as similarity
  from public.npc_inner_thoughts nit
  where nit.playthrough_id = p_playthrough_id
    and nit.character_id = p_character_id
    and nit.embedding is not null
    and (
      array_length(p_exclude_turn_indexes, 1) is null
      or not (nit.turn_index = any(p_exclude_turn_indexes))
    )
    and (1 - (nit.embedding <=> p_query_embedding)) >= p_min_similarity
  order by nit.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_npc_inner_thoughts(
  uuid, uuid, extensions.vector, integer, float, integer[]
) to authenticated, service_role;


-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- Table created
--   select count(*) from information_schema.tables where table_name='npc_inner_thoughts';
--
--   -- RLS enabled
--   select relrowsecurity from pg_class where relname='npc_inner_thoughts';
--
--   -- Check constraints
--   select conname from pg_constraint
--   where conrelid='public.npc_inner_thoughts'::regclass and contype='c';
--
--   -- Indexes (including HNSW)
--   select indexname from pg_indexes where tablename='npc_inner_thoughts';
--
--   -- RPCs present + service-role grants
--   select proname, proacl
--   from pg_proc
--   where proname in ('apply_npc_inner_thought', 'match_npc_inner_thoughts');
-- =========================================================================
