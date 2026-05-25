-- Migration 0025 · Phase 1 · Knowledge graph edges between lorebook entries
-- =========================================================================
-- PHASE 1 GOAL · enable relational retrieval beyond top-K vector search.
-- lorebook_entries serve as **nodes**; this migration adds **edges** so
-- Director / Narrator can ask "find all entities related to 林思雅 within
-- 2 hops" and traverse NPC relationships, location-event mappings, etc.
--
-- DESIGN:
--   - Reuse lorebook_entries as nodes (avoid table proliferation)
--   - Add mem_edges (source, target, edge_type, weight, properties)
--   - Service-role writes only (Director output is the canonical source)
--   - RPC walk_lorebook_graph for selective relational retrieval
--
-- EDGE TYPE CONTROLLED VOCABULARY (CLAUDE.md hard rule #28):
--   Controlled enum prevents LLM hallucinating free-text edge types that
--   developer code can't filter on. Add new types via future migrations.
--
-- HARD RULE COMPLIANCE:
--   - #5 Narrative Integrity — graph mutation = service-role only · user
--     can't browser-console inject edges to alter relationships
--   - #11 prompt cache — edges are per-turn payload · stay out of cached
--   - #15 column-level — edge_type controlled · weight clamped 0..1
--
-- REQUIRES: 0023 applied (lorebook_entries.wing column for typed nodes)
-- =========================================================================


-- =========================================================================
-- 1. mem_edges table · relationships between lorebook entries (nodes)
-- =========================================================================
create table if not exists public.mem_edges (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  source_id uuid not null references public.lorebook_entries(id) on delete cascade,
  target_id uuid not null references public.lorebook_entries(id) on delete cascade,
  edge_type text not null,
  weight real not null default 0.5,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A node may have many edges of different types to the same target
  -- (e.g., "loves" + "rival" between two characters · complex relationship)
  -- but only ONE edge of a given type between the same pair
  constraint mem_edges_unique_triple unique (source_id, target_id, edge_type),
  -- No self-edges (would create infinite traversal loops)
  constraint mem_edges_no_self_loop check (source_id <> target_id),
  -- Weight in [0, 1] · 0=weak/uncertain · 1=strong/canonical
  constraint mem_edges_weight_range check (weight >= 0 and weight <= 1),
  -- Properties must be object (hard rule #15 defensive)
  constraint mem_edges_properties_object check (jsonb_typeof(properties) = 'object')
);


-- =========================================================================
-- 2. Edge type controlled vocabulary (CLAUDE.md hard rule #28)
--    Director must pick from these · code joins on this enum
-- =========================================================================
alter table public.mem_edges
  drop constraint if exists mem_edges_type_enum;

alter table public.mem_edges
  add constraint mem_edges_type_enum check (
    edge_type in (
      -- Relationship edges (character↔character)
      'loves',          -- romantic / familial love
      'hates',          -- active antagonism
      'rival',          -- competitive but not hostile
      'mentor',         -- knowledge/skill teaching
      'sibling',        -- biological / chosen family
      'friend',         -- mutual positive
      'colleague',      -- professional / classmate
      'subordinate',    -- power hierarchy below
      'superior',       -- power hierarchy above
      -- Spatial edges (character↔place · item↔place · etc)
      'located_at',     -- currently / typically at
      'origin',         -- originally from
      -- Causal / temporal edges (event↔*)
      'caused',         -- event causation
      'attended',       -- character attended event
      'witnessed',      -- character witnessed event
      'remembers',      -- character remembers (memory-anchored)
      -- Possession edges (character↔item · place↔item)
      'owns',           -- ownership
      'created',        -- author / creator
      'destroyed',      -- destruction
      -- Conceptual edges (any↔concept)
      'embodies',       -- exemplifies a theme / concept
      'opposes',        -- thematic opposition
      'represents'      -- symbolic representation
    )
  );


-- =========================================================================
-- 3. Indexes for graph walks
-- =========================================================================
create index if not exists mem_edges_source_idx
  on public.mem_edges (source_id, edge_type);

create index if not exists mem_edges_target_idx
  on public.mem_edges (target_id, edge_type);

create index if not exists mem_edges_playthrough_idx
  on public.mem_edges (playthrough_id);

-- Updated_at trigger (same pattern as lorebook_entries)
drop trigger if exists mem_edges_updated_at on public.mem_edges;
create trigger mem_edges_updated_at
  before insert or update on public.mem_edges
  for each row execute function public.set_updated_at();


-- =========================================================================
-- 4. RLS · service-role writes only · authenticated reads own
-- =========================================================================
alter table public.mem_edges enable row level security;

-- Read: user can see edges for their own playthroughs
drop policy if exists "mem_edges_own_select" on public.mem_edges;
create policy "mem_edges_own_select" on public.mem_edges
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

-- NO insert/update/delete policies for authenticated · service-role only.
-- This mirrors Migration 0018 lockdown for memory tables (lorebook_entries,
-- memory_summaries, turn_embeddings) · prevents browser-console injection
-- of fake relationships that could subvert Narrative Integrity Engine.
revoke insert, update, delete on public.mem_edges from authenticated, anon;


-- =========================================================================
-- 5. RPC: walk_lorebook_graph
--    Given a starting node (by name or id), traverse outbound edges up to
--    max_hops · return reached nodes ordered by path weight (product of
--    edge weights along path).
--
--    Use case: Director outputs `rooms_to_load: ["林思雅"]` · this RPC can
--    expand to "林思雅 + her siblings + her workplace + her rival" via
--    1-2 hops.
--
--    SECURITY INVOKER → RLS still applies · user can only walk their own
--    playthrough's graph.
-- =========================================================================
create or replace function public.walk_lorebook_graph(
  p_playthrough_id uuid,
  p_start_name text,
  p_max_hops integer default 2,
  p_max_results integer default 8,
  p_edge_types text[] default null
)
returns table (
  node_id uuid,
  node_name text,
  node_wing text,
  node_description text,
  hops integer,
  path_weight real,
  reached_via_edge_type text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_start_id uuid;
begin
  -- Clamp inputs · defensive
  if p_max_hops < 1 then p_max_hops := 1; end if;
  if p_max_hops > 3 then p_max_hops := 3; end if;
  if p_max_results < 1 then p_max_results := 1; end if;
  if p_max_results > 20 then p_max_results := 20; end if;

  -- Resolve start node by name (case-insensitive) within playthrough
  select id into v_start_id
  from public.lorebook_entries
  where playthrough_id = p_playthrough_id
    and lower(name) = lower(p_start_name)
  limit 1;

  if v_start_id is null then
    return; -- No start node · return empty
  end if;

  -- BFS via recursive CTE · track hops + product of weights
  return query
  with recursive walk as (
    -- Base: start node (hop 0)
    select
      v_start_id as node_id,
      0::integer as hops,
      1.0::real as path_weight,
      ''::text as reached_via_edge_type
    union all
    -- Step: follow outbound edges from any node currently in walk
    select
      e.target_id as node_id,
      w.hops + 1 as hops,
      w.path_weight * e.weight as path_weight,
      e.edge_type as reached_via_edge_type
    from walk w
    join public.mem_edges e on e.source_id = w.node_id
    where w.hops < p_max_hops
      and e.playthrough_id = p_playthrough_id
      and (p_edge_types is null or e.edge_type = any(p_edge_types))
  )
  select
    le.id as node_id,
    le.name as node_name,
    le.wing as node_wing,
    le.description as node_description,
    min(w.hops) as hops,
    max(w.path_weight) as path_weight,
    -- Pick the edge type of the best path (highest weight)
    (
      select w2.reached_via_edge_type
      from walk w2
      where w2.node_id = le.id
      order by w2.path_weight desc nulls last
      limit 1
    ) as reached_via_edge_type
  from walk w
  join public.lorebook_entries le on le.id = w.node_id
  where w.hops > 0 -- exclude the start node itself
  group by le.id, le.name, le.wing, le.description
  order by max(w.path_weight) desc nulls last, min(w.hops) asc
  limit p_max_results;
end;
$$;

grant execute on function public.walk_lorebook_graph(uuid, text, integer, integer, text[])
  to authenticated, service_role;


-- =========================================================================
-- 6. RPC: add_lorebook_edge · service-role helper to create edges
--    Resolves names → ids · UPSERTs the edge with the given type + weight.
--    Idempotent: same (source, target, type) updates weight + properties.
-- =========================================================================
create or replace function public.add_lorebook_edge(
  p_playthrough_id uuid,
  p_source_name text,
  p_target_name text,
  p_edge_type text,
  p_weight real default 0.5,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_target_id uuid;
  v_edge_id uuid;
begin
  -- Resolve nodes by name within playthrough
  select id into v_source_id
  from public.lorebook_entries
  where playthrough_id = p_playthrough_id
    and lower(name) = lower(p_source_name)
  limit 1;

  select id into v_target_id
  from public.lorebook_entries
  where playthrough_id = p_playthrough_id
    and lower(name) = lower(p_target_name)
  limit 1;

  if v_source_id is null or v_target_id is null then
    -- One or both nodes don't exist · skip silently (Director extraction
    -- may name an NPC that hasn't been lorebook-extracted yet · safety net)
    return null;
  end if;

  if v_source_id = v_target_id then
    return null; -- no self-loops
  end if;

  insert into public.mem_edges (
    playthrough_id, source_id, target_id, edge_type, weight, properties
  ) values (
    p_playthrough_id, v_source_id, v_target_id, p_edge_type, p_weight, p_properties
  )
  on conflict (source_id, target_id, edge_type) do update
    set weight = excluded.weight,
        properties = excluded.properties,
        updated_at = now()
  returning id into v_edge_id;

  return v_edge_id;
end;
$$;

revoke execute on function public.add_lorebook_edge(uuid, text, text, text, real, jsonb)
  from public, anon, authenticated;
grant execute on function public.add_lorebook_edge(uuid, text, text, text, real, jsonb)
  to service_role;


-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   -- Table + columns
--   select count(*) from information_schema.tables
--   where table_name = 'mem_edges';
--
--   -- Check constraints (enum + no self-loop + weight range)
--   select conname from pg_constraint
--   where conrelid = 'public.mem_edges'::regclass;
--
--   -- Indexes
--   select indexname from pg_indexes
--   where tablename = 'mem_edges';
--
--   -- RLS + service-role only writes
--   select polname, cmd from pg_policies where tablename = 'mem_edges';
--
--   -- RPCs present
--   select proname from pg_proc
--   where proname in ('walk_lorebook_graph', 'add_lorebook_edge');
-- =========================================================================
