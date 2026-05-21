-- Migration 0005 — Phase 2 audit fixes (Wave 1)
--
-- Addresses 5 audit findings from `audit-report-phase2-deep.html`:
--   - P2-LOGIC-C-02  UNIQUE on memory_summaries(playthrough_id, turn_range)
--                    to prevent concurrent-rollup duplicate inserts
--   - P2-UX-C-02     Similarity threshold on all 3 match RPCs — return
--                    EMPTY beats returning noise
--   - P2-LOGIC-M-11  CHECK constraint on vector dimensions (defense in depth)
--   - P2-PERF-L-13   match_turn_embeddings overprovisions HNSW candidates
--                    so NOT-IN exclusions don't shrink result set below K
--   - P2-LOGIC-H-07  UNIQUE index uses btrim() to catch trailing-whitespace
--                    duplicate names in lorebook
--
-- REQUIRES: Migration 0004 applied first.
--
-- Safe to re-run.


-- ============================================================================
-- P2-LOGIC-C-02 — UNIQUE constraint on memory_summaries(playthrough_id, turn_range)
-- ============================================================================
-- Without this, two summarizer fire-and-forgets running concurrently for the
-- same playthrough (e.g., after waitUntil fix lets background work actually
-- finish, race window reopens) would each insert a row covering the same
-- 20-turn range. RAG retrieves both → double-cost + token waste.
-- ============================================================================
create unique index if not exists memory_summaries_unique_range
  on public.memory_summaries (playthrough_id, turn_range);


-- ============================================================================
-- P2-LOGIC-H-07 — UNIQUE on lorebook with btrim() for case + whitespace
-- ============================================================================
-- The original 0004 index used `lower(name)` only. Trailing whitespace
-- ("林思雅 " vs "林思雅") bypassed the dedup because lower() doesn't trim.
-- Drop the old index, create a new one wrapping btrim().
-- ============================================================================
drop index if exists public.lorebook_unique_per_playthrough_name;
create unique index if not exists lorebook_unique_per_playthrough_name
  on public.lorebook_entries (playthrough_id, lower(btrim(name)));


-- ============================================================================
-- P2-LOGIC-M-11 — Dimension CHECK constraint (defense in depth)
-- ============================================================================
-- The `vector(1536)` column already enforces dimension on insert via pgvector,
-- but a future backfill / direct SQL path could try insert wrong-dim. Belt +
-- braces — explicit CHECK so any drift is loud.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'turn_embeddings_dim_1536'
  ) then
    alter table public.turn_embeddings
      add constraint turn_embeddings_dim_1536
      check (vector_dims(embedding) = 1536);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'memory_summaries_dim_1536'
  ) then
    alter table public.memory_summaries
      add constraint memory_summaries_dim_1536
      check (vector_dims(embedding) = 1536);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'lorebook_entries_dim_1536'
  ) then
    alter table public.lorebook_entries
      add constraint lorebook_entries_dim_1536
      check (vector_dims(embedding) = 1536);
  end if;
end $$;


-- ============================================================================
-- P2-UX-C-02 + P2-LOGIC-M-10 + P2-PERF-L-13
-- Updated match RPCs — similarity threshold + overprovision for exclusions
-- ============================================================================
-- All three RPCs gain `p_min_similarity float default 0.0` parameter. Caller
-- passes per-source threshold (RAG 0.5 / lorebook 0.45 / summaries 0.55 —
-- tuned in retriever.ts). Setting default to 0.0 keeps backward compat.
--
-- match_turn_embeddings: bumps internal candidate fetch to (p_match_count * 5)
-- so when NOT-IN exclusions filter out half, we still hit K results.
-- ============================================================================

create or replace function public.match_turn_embeddings(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_exclude_turn_indexes integer[] default array[]::integer[],
  p_min_similarity float default 0.0
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
  -- Overprovision HNSW candidate fetch to 5x match_count so exclusion filter
  -- (NOT IN p_exclude_turn_indexes) doesn't shrink final set below K.
  with candidates as (
    select
      te.turn_id,
      te.embedding,
      1 - (te.embedding <=> p_query_embedding) as similarity
    from public.turn_embeddings te
    join public.turns t on t.id = te.turn_id
    where t.playthrough_id = p_playthrough_id
    order by te.embedding <=> p_query_embedding
    limit greatest(p_match_count * 5, 25)
  )
  select
    c.turn_id,
    t.turn_index,
    t.role,
    t.text,
    c.similarity
  from candidates c
  join public.turns t on t.id = c.turn_id
  where (
    array_length(p_exclude_turn_indexes, 1) is null
    or not (t.turn_index = any (p_exclude_turn_indexes))
  )
  and c.similarity >= p_min_similarity
  order by c.similarity desc
  limit p_match_count;
$$;

create or replace function public.match_memory_summaries(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_min_similarity float default 0.0
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
    and (1 - (ms.embedding <=> p_query_embedding)) >= p_min_similarity
  order by ms.embedding <=> p_query_embedding
  limit p_match_count;
$$;

create or replace function public.match_lorebook_entries(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_min_similarity float default 0.0
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
    and (1 - (le.embedding <=> p_query_embedding)) >= p_min_similarity
  order by le.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Re-grant — function signatures changed (added p_min_similarity param)
grant execute on function public.match_turn_embeddings(uuid, extensions.vector, integer, integer[], float) to authenticated;
grant execute on function public.match_memory_summaries(uuid, extensions.vector, integer, float) to authenticated;
grant execute on function public.match_lorebook_entries(uuid, extensions.vector, integer, float) to authenticated;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'memory_summaries_unique_range') then
    raise exception 'memory_summaries_unique_range index not created';
  end if;
end $$;
