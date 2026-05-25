-- Migration 0020 · Session 10 Phase 0 · RAG similarity floors
-- =========================================================================
-- CLAUDE.md hard rule #18 finally enforced:
--   "Top-K retrieval 冇 similarity floor 等於 noise by design.
--    ORDER BY similarity LIMIT K 一定返 K row 唔理多 irrelevant.
--    回 EMPTY 好過回 noise. Tune per source:
--       summaries 0.55 / RAG 0.5 / lorebook 0.45"
--
-- Without floors: every turn injects top-3 chunks regardless of relevance.
-- For setup turns / off-topic banter, this dumps unrelated past memories
-- into context · dilutes Narrator focus · wastes tokens.
--
-- With floors: irrelevant turns return EMPTY (cleaner context · faster ·
-- cheaper · less LLM hallucination from off-topic retrievals).
--
-- 3 RPCs touched (defined in 0004_memory_layer.sql):
--   - match_turn_embeddings (RAG primary · floor 0.5)
--   - match_memory_summaries (rolling summaries · floor 0.55)
--   - match_lorebook_entries (non-always-on lorebook · floor 0.45)
-- =========================================================================

-- ─── 1. match_turn_embeddings · floor 0.5 ────────────────────────────────
create or replace function public.match_turn_embeddings(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_exclude_turn_indexes integer[] default array[]::integer[]
)
returns table (
  turn_id uuid,
  turn_index integer,
  role text,
  text text,
  similarity float
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    te.turn_id,
    t.turn_index,
    t.role,
    t.text,
    1 - (te.embedding <=> p_query_embedding) as similarity
  from public.turn_embeddings te
  join public.turns t on t.id = te.turn_id
  where t.playthrough_id = p_playthrough_id
    and (1 - (te.embedding <=> p_query_embedding)) >= 0.5  -- CLAUDE.md #18 floor
    and (
      array_length(p_exclude_turn_indexes, 1) is null
      or not (t.turn_index = any (p_exclude_turn_indexes))
    )
  order by te.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ─── 2. match_memory_summaries · floor 0.55 ──────────────────────────────
create or replace function public.match_memory_summaries(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer
)
returns table (
  id uuid,
  turn_range int4range,
  summary_text text,
  similarity float
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    ms.id,
    ms.turn_range,
    ms.summary_text,
    1 - (ms.embedding <=> p_query_embedding) as similarity
  from public.memory_summaries ms
  where ms.playthrough_id = p_playthrough_id
    and (1 - (ms.embedding <=> p_query_embedding)) >= 0.55  -- CLAUDE.md #18 floor
  order by ms.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ─── 3. match_lorebook_entries · floor 0.45 ──────────────────────────────
create or replace function public.match_lorebook_entries(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer
)
returns table (
  id uuid,
  entity_type text,
  name text,
  description text,
  similarity float
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    le.id,
    le.entity_type,
    le.name,
    le.description,
    1 - (le.embedding <=> p_query_embedding) as similarity
  from public.lorebook_entries le
  where le.playthrough_id = p_playthrough_id
    and le.always_on = false
    and (1 - (le.embedding <=> p_query_embedding)) >= 0.45  -- CLAUDE.md #18 floor
  order by le.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- =========================================================================
-- Sanity (run after apply):
--   -- Verify all 3 RPCs exist with the new floor logic
--   select proname, pronargs
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('match_turn_embeddings', 'match_memory_summaries', 'match_lorebook_entries')
--   order by proname;
--
-- Expected output: 3 rows, pronargs: 4 · 3 · 3.
-- =========================================================================
