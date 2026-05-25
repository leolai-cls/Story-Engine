-- Migration 0023 · Phase 1 · MemPalace hierarchical namespace
-- =========================================================================
-- 4-LAYER MEMORY EVOLUTION (Wings / Rooms / Drawers):
--   Founder reference: github.com/MemPalace/mempalace
--   Goal: replace blanket top-K retrieval with selective room-loading so
--   Director can pull only relevant rooms per turn · reduces context noise
--   + cost on each Narrator call.
--
-- 概念對應：
--   Wing     = top-level category (controlled vocabulary · stable)
--   Room     = scoped sub-namespace (free text · per-playthrough)
--   Drawer   = individual lorebook entry (existing row)
--
-- ARCHITECTURE:
--   Additive — extends `lorebook_entries` with `wing` + `room` columns.
--   Existing rows backfilled (entity_type → wing 1-1 mapping).
--   New `match_lorebook_by_rooms` RPC for Director-driven selective load.
--   Existing `match_lorebook_entries` RPC untouched (backwards compat).
--
-- HARD RULE COMPLIANCE:
--   - #15 column-level protection — wing constrained to controlled enum
--     (CLAUDE.md hard rule #28: never LLM-generated free-text identifier
--     when developer code joins on it)
--   - #11 cache-friendly — wing/room are small payload, prompt template
--     stays static (Anthropic cache hit preserved)
--   - #18 similarity floor — new RPC accepts p_min_similarity param
--
-- REQUIRES: 0004 + 0018 applied (lorebook_entries table + RLS lockdown)
-- =========================================================================


-- =========================================================================
-- 1. Add wing + room columns to lorebook_entries
-- =========================================================================
alter table public.lorebook_entries
  add column if not exists wing text,
  add column if not exists room text;


-- =========================================================================
-- 2. Wing controlled vocabulary (CLAUDE.md hard rule #28 compliance)
--    LLM extractor or Director output must use ONE of these · code joins
--    on this enum · never free-text wing names
-- =========================================================================
alter table public.lorebook_entries
  drop constraint if exists lorebook_wing_enum;

alter table public.lorebook_entries
  add constraint lorebook_wing_enum check (
    wing is null or wing in (
      'characters',  -- NPC memory
      'places',      -- locations
      'items',       -- props · heirlooms · weapons
      'events',      -- story-significant events
      'lore',        -- abstract concepts · world rules · social rules
      'protagonist'  -- player character (reserved · usually skipped)
    )
  );


-- =========================================================================
-- 3. Backfill existing rows · entity_type 1-1 mapping
--    Pre-existing entries get a sensible default so retriever can keep
--    working immediately without re-extraction.
-- =========================================================================
update public.lorebook_entries
set wing = case entity_type
  when 'character' then 'characters'
  when 'place'     then 'places'
  when 'item'      then 'items'
  when 'event'     then 'events'
  when 'concept'   then 'lore'
  else 'lore'
end
where wing is null;

-- After backfill · enforce NOT NULL going forward · new inserts must specify
alter table public.lorebook_entries
  alter column wing set not null;

-- Default 'lore' for any future insert that omits wing (defensive · most
-- extractor paths should set wing explicitly per the schema in lorebook.ts)
alter table public.lorebook_entries
  alter column wing set default 'lore';


-- =========================================================================
-- 4. Room — free text scoped per (playthrough_id, wing)
--    Stays nullable · NULL room = "wing-level drawer" (no sub-namespace)
--    Common room values:
--      wing='characters' room='林思雅'           → 林思雅 specific drawer
--      wing='places'     room='港大宿舍'         → 港大宿舍 specific drawer
--      wing='events'     room='act1_confession'  → scene tag
--      wing='lore'       room=NULL               → wing-level (general lore)
-- =========================================================================

-- Index for room-scoped lookup · partial (skip NULL rooms)
create index if not exists lorebook_room_lookup_idx
  on public.lorebook_entries (playthrough_id, wing, room)
  where room is not null;

-- Index for wing-only lookup (broad selectivity scan)
create index if not exists lorebook_wing_lookup_idx
  on public.lorebook_entries (playthrough_id, wing);


-- =========================================================================
-- 5. RPC: match_lorebook_by_rooms
--    Director outputs rooms_to_load string[] per turn (e.g., when player
--    talks to 林思雅, Director emits ["林思雅"] · retriever loads ONLY that
--    drawer instead of top-K across all entries · preserves token budget
--    + reduces noise).
--
--    Filters:
--      - similarity floor (CLAUDE.md hard rule #18 · top-K w/o floor = noise)
--      - room match: any of p_rooms (case-insensitive) within p_wings
--      - skip always_on (those are fetched via cheap separate query)
--
--    Returns rows ordered by similarity (highest first).
-- =========================================================================
create or replace function public.match_lorebook_by_rooms(
  p_playthrough_id uuid,
  p_query_embedding extensions.vector(1536),
  p_wings text[],
  p_rooms text[] default array[]::text[],
  p_match_count integer default 8,
  p_min_similarity float default 0.4
)
returns table (
  id uuid,
  entity_type text,
  wing text,
  room text,
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
    le.wing,
    le.room,
    le.name,
    le.description,
    1 - (le.embedding <=> p_query_embedding) as similarity
  from public.lorebook_entries le
  where le.playthrough_id = p_playthrough_id
    and le.always_on = false
    -- Wing filter: must be in requested set (empty array = no constraint)
    and (
      array_length(p_wings, 1) is null
      or le.wing = any(p_wings)
    )
    -- Room filter: if rooms specified, must match one of them (case-insensitive)
    -- If p_rooms empty AND p_wings specified · accepts ANY room within wing
    and (
      array_length(p_rooms, 1) is null
      or lower(le.room) = any(
        select lower(r) from unnest(p_rooms) as r
      )
    )
    -- Similarity floor (hard rule #18)
    and (1 - (le.embedding <=> p_query_embedding)) >= p_min_similarity
  order by le.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_lorebook_by_rooms(
  uuid, extensions.vector, text[], text[], integer, float
) to authenticated, service_role;


-- =========================================================================
-- 6. RPC: list_lorebook_rooms
--    Director needs to know which rooms exist for a given playthrough so
--    it can decide which to load. Returns distinct (wing, room) pairs +
--    drawer count + last-updated · efficient summary for Director context.
-- =========================================================================
create or replace function public.list_lorebook_rooms(
  p_playthrough_id uuid
)
returns table (
  wing text,
  room text,
  drawer_count integer,
  last_updated timestamptz
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    wing,
    room,
    count(*)::integer as drawer_count,
    max(updated_at) as last_updated
  from public.lorebook_entries
  where playthrough_id = p_playthrough_id
  group by wing, room
  order by max(updated_at) desc;
$$;

grant execute on function public.list_lorebook_rooms(uuid)
  to authenticated, service_role;


-- =========================================================================
-- 7. Lockdown · wing column is locked-at-creation
--    AUDIT compliance with CLAUDE.md hard rule #15 corollary:
--    Once a drawer is filed in a wing · it cannot be moved (entity_type
--    + wing are stable identity dimensions). Room CAN change (NPC moves
--    to new scene · scene tag updates) but wing is identity.
--
--    BEFORE UPDATE trigger blocks wing changes by authenticated users.
--    Service role can override (extractor refinement · admin tools).
-- =========================================================================
create or replace function public.protect_lorebook_wing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Allow service_role / postgres / direct DB tools to bypass
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or current_user = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  -- Reject wing changes by authenticated users
  if new.wing is distinct from old.wing then
    raise exception
      'lorebook wing is locked at drawer creation · cannot be moved across wings (hard rule #15 corollary)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_lorebook_wing on public.lorebook_entries;
create trigger trg_protect_lorebook_wing
  before update on public.lorebook_entries
  for each row
  execute function public.protect_lorebook_wing();


-- =========================================================================
-- SANITY CHECKS · run after apply
-- =========================================================================
--   -- Verify wing column + check constraint
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'lorebook_entries'
--     and column_name in ('wing', 'room');
--
--   -- Verify check constraint
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'lorebook_wing_enum';
--
--   -- Verify trigger present
--   select tgname from pg_trigger
--   where tgrelid = 'public.lorebook_entries'::regclass
--     and tgname = 'trg_protect_lorebook_wing';
--
--   -- Verify backfill (all rows should have wing)
--   select count(*) filter (where wing is null) as null_wings,
--          count(*) as total
--   from public.lorebook_entries;
--   -- Expected: null_wings = 0
--
--   -- Verify RPCs callable
--   select 1 from pg_proc where proname = 'match_lorebook_by_rooms';
--   select 1 from pg_proc where proname = 'list_lorebook_rooms';
-- =========================================================================
