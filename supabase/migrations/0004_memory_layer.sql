-- Migration 0004 — Phase 2 Memory Layer (pgvector tables)
--
-- 4-layer memory architecture per ADR-005 / CLAUDE.md:
--   1. Recent N turns (full text, chronological)  — already in `turns` table
--   2. Rolling summaries (every 20 turns)         — `memory_summaries` (this migration)
--   3. RAG over individual turn texts             — `turn_embeddings` (this migration)
--   4. Auto-extracted lorebook entities           — `lorebook_entries` (this migration)
--
-- Embedding model: OpenAI text-embedding-3-small (1536-dim, 中文-friendly)
-- Similarity search: cosine distance via pgvector HNSW indexes
--
-- REQUIRES: Migration 0002 applied first (enables `vector` extension).
--           If 0002 not yet applied, this migration's sanity check at
--           the bottom will raise loudly.
--
-- Safe to re-run (idempotent guards).


-- ============================================================================
-- turn_embeddings — one row per AI turn, embedding of its text
-- ----------------------------------------------------------------------------
-- Retrieved when player's current action has high cosine similarity to a
-- past turn. Lets the Narrator "remember" specific scenes 100+ turns later
-- without paying full token cost on every prior turn.
--
-- Cascade: turn deletion → embedding deletion (we never want orphan vectors).
-- ============================================================================
create table if not exists public.turn_embeddings (
  turn_id uuid primary key references public.turns(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);


-- ============================================================================
-- memory_summaries — rolling 20-turn rollups
-- ----------------------------------------------------------------------------
-- After every Nth turn (typically 20), the summarizer compresses turns
-- [N-19, N] into 1-3 paragraphs capturing key events / relationship shifts /
-- decisions. Both `summary_text` and an embedding are stored — text gets
-- injected into Narrator context, embedding lets us retrieve relevant
-- summaries via similarity instead of always sending all of them.
--
-- `turn_range` (int4range) records which turn indexes this summary covers,
-- so retriever can skip summaries that overlap with the "recent N turns"
-- window (avoid double-counting).
-- ============================================================================
create table if not exists public.memory_summaries (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  turn_range int4range not null,
  summary_text text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists memory_summaries_playthrough_idx
  on public.memory_summaries (playthrough_id, created_at desc);


-- ============================================================================
-- lorebook_entries — auto-extracted entities per playthrough
-- ----------------------------------------------------------------------------
-- Per-turn extraction picks out characters / places / items / events /
-- concepts that emerged in the narrative. Stored as:
--   - name (canonical) + description (1-3 sentences)
--   - keywords (for cheap keyword-match before vector search)
--   - always_on flag (story-critical facts that ALWAYS get injected,
--     bypassing similarity gate — e.g., "你係 1980s 香港差人")
--   - embedding (for similarity-matched retrieval)
--
-- Phase 5 community will add story-level shared lorebook (story_id column).
-- For now: per-playthrough only — simpler RLS, no shared mutation surface.
-- ============================================================================
create table if not exists public.lorebook_entries (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('character', 'place', 'item', 'event', 'concept')
  ),
  name text not null,
  description text not null,
  always_on boolean not null default false,
  keywords text[] not null default array[]::text[],
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-playthrough listing
create index if not exists lorebook_playthrough_idx
  on public.lorebook_entries (playthrough_id);

-- Fast-path for always_on retrieval (no similarity needed — fetched every turn)
create index if not exists lorebook_always_on_idx
  on public.lorebook_entries (playthrough_id)
  where always_on = true;

-- Dedup on name within a playthrough (case-insensitive) — extractor will
-- upsert by name so multiple mentions of "林思雅" don't create duplicates
create unique index if not exists lorebook_unique_per_playthrough_name
  on public.lorebook_entries (playthrough_id, lower(name));

-- updated_at trigger (matches Migration 0002 pattern — BEFORE INSERT OR UPDATE)
drop trigger if exists lorebook_updated_at on public.lorebook_entries;
create trigger lorebook_updated_at
  before insert or update on public.lorebook_entries
  for each row execute function public.set_updated_at();


-- ============================================================================
-- HNSW indexes for cosine-similarity search
-- ----------------------------------------------------------------------------
-- HNSW (Hierarchical Navigable Small World) gives sub-linear search time
-- with high recall. Default parameters (m=16, ef_construction=64) are a
-- good baseline; can tune up for higher recall at insert-cost trade-off
-- later if needed.
--
-- `vector_cosine_ops` operator class — we use cosine distance because
-- OpenAI text-embedding-3-small is unit-normalized and cosine ≈ dot product
-- for normalized vectors. Cheaper than L2 distance for our use case.
-- ============================================================================
create index if not exists turn_embeddings_hnsw_cos
  on public.turn_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists memory_summaries_hnsw_cos
  on public.memory_summaries
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists lorebook_entries_hnsw_cos
  on public.lorebook_entries
  using hnsw (embedding extensions.vector_cosine_ops);


-- ============================================================================
-- RLS — enable + policies (read/insert/update via playthrough ownership)
-- ----------------------------------------------------------------------------
-- Same pattern as the rest of the schema: user can only see / write rows
-- linked to a playthrough they own. No DELETE policies — memory is
-- append-only (CLAUDE.md "credits ledger" spirit applied to memory).
-- ============================================================================
alter table public.turn_embeddings    enable row level security;
alter table public.memory_summaries   enable row level security;
alter table public.lorebook_entries   enable row level security;


-- ---------- turn_embeddings (linked via turns → playthroughs) ----------------
drop policy if exists "turn_embeddings_own_select"  on public.turn_embeddings;
drop policy if exists "turn_embeddings_own_insert"  on public.turn_embeddings;

create policy "turn_embeddings_own_select" on public.turn_embeddings
  for select using (
    exists (
      select 1
        from public.turns t
        join public.playthroughs p on p.id = t.playthrough_id
        where t.id = turn_embeddings.turn_id
          and p.user_id = auth.uid()
    )
  );

create policy "turn_embeddings_own_insert" on public.turn_embeddings
  for insert with check (
    exists (
      select 1
        from public.turns t
        join public.playthroughs p on p.id = t.playthrough_id
        where t.id = turn_embeddings.turn_id
          and p.user_id = auth.uid()
    )
  );


-- ---------- memory_summaries ------------------------------------------------
drop policy if exists "memory_summaries_own_select"  on public.memory_summaries;
drop policy if exists "memory_summaries_own_insert"  on public.memory_summaries;

create policy "memory_summaries_own_select" on public.memory_summaries
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "memory_summaries_own_insert" on public.memory_summaries
  for insert with check (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );


-- ---------- lorebook_entries ------------------------------------------------
-- Read + insert + update allowed (lorebook entries get updated as the player
-- learns more about an entity). NO DELETE — extractor only adds + refines.
drop policy if exists "lorebook_own_select"   on public.lorebook_entries;
drop policy if exists "lorebook_own_insert"   on public.lorebook_entries;
drop policy if exists "lorebook_own_update"   on public.lorebook_entries;

create policy "lorebook_own_select" on public.lorebook_entries
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "lorebook_own_insert" on public.lorebook_entries
  for insert with check (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "lorebook_own_update" on public.lorebook_entries
  for update
    using (
      exists (
        select 1 from public.playthroughs p
        where p.id = playthrough_id and p.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.playthroughs p
        where p.id = playthrough_id and p.user_id = auth.uid()
      )
    );


-- ============================================================================
-- RPC — match_turn_embeddings + match_memory_summaries + match_lorebook
-- ----------------------------------------------------------------------------
-- Helper functions for the retriever — cosine-similarity search with row-
-- level filtering by playthrough_id. SECURITY INVOKER → RLS still applies.
-- ============================================================================

-- Search past turns by similarity to a query embedding.
-- Returns turn_id + similarity score (1 - cosine_distance, higher = better).
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
    and (
      array_length(p_exclude_turn_indexes, 1) is null
      or not (t.turn_index = any (p_exclude_turn_indexes))
    )
  order by te.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Search rolling summaries by similarity.
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
  order by ms.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Search lorebook by similarity (NON-always_on; always_on entries are fetched
-- via a separate cheap query).
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
  order by le.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_turn_embeddings(uuid, extensions.vector, integer, integer[]) to authenticated;
grant execute on function public.match_memory_summaries(uuid, extensions.vector, integer) to authenticated;
grant execute on function public.match_lorebook_entries(uuid, extensions.vector, integer) to authenticated;


-- ============================================================================
-- SANITY CHECKS
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    raise exception 'vector extension required — apply migration 0002 first';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'match_turn_embeddings'
  ) then
    raise exception 'match_turn_embeddings RPC not created';
  end if;
end $$;
