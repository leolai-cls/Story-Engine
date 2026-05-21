-- Migration 0003 — Atomic RPCs for turn pipeline (Wave 5 audit fixes)
--
-- Addresses race conditions and silent corruption in the turn endpoint
-- where multiple Postgres reads/writes happened across the lifetime of an
-- in-flight LLM stream. Both AI-C-01/DB-H-04 (disposition lost-update) and
-- AI-C-03/DB-H-03 (turn-count race) get solved by single atomic SQL.
--
-- Applied AFTER 0002. Safe to re-run (CREATE OR REPLACE).


-- ============================================================================
-- AI-C-03 / DB-H-03 — acquire_next_turn_pair
-- ----------------------------------------------------------------------------
-- Previously turn route read `pt.turn_count`, used it for both user_idx and
-- ai_idx (count+1), then later wrote `turn_count = pt.turn_count + 2`. Under
-- concurrency (multi-region Vercel instances, fast re-submit, etc.) two
-- requests could read the same value, both try to insert the same indexes,
-- and one hit the UNIQUE constraint AFTER its stream had already burned
-- credits.
--
-- Solution: atomic `UPDATE ... RETURNING` reserves the next pair of
-- indexes in one DB roundtrip. Caller uses (user_idx, ai_idx) when later
-- inserting turn rows. The UNIQUE constraint becomes a backup, not the
-- primary defense.
--
-- Returns: (user_idx int, ai_idx int) — the indexes to use for user/AI turns
-- this round. Throws if playthrough doesn't exist (caller should treat as 404).
-- ============================================================================
create or replace function public.acquire_next_turn_pair(
  p_playthrough_id uuid
)
returns table (user_idx integer, ai_idx integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  old_count integer;
begin
  update public.playthroughs
    set turn_count = turn_count + 2,
        last_played_at = now()
    where id = p_playthrough_id
    returning turn_count - 2 into old_count;

  if old_count is null then
    raise exception 'playthrough_not_found' using errcode = 'P0002';
  end if;

  user_idx := old_count;
  ai_idx := old_count + 1;
  return next;
end;
$$;

-- Caller is the authenticated user via PostgREST; SECURITY INVOKER means
-- the function runs as that user → existing RLS on playthroughs applies.
-- A user can only acquire pairs for THEIR own playthroughs.


-- ============================================================================
-- AI-C-01 / DB-H-04 — apply_turn_npc_changes
-- ----------------------------------------------------------------------------
-- Previously turn route looped over disposition changes, building each upsert
-- from the SAME `existingState` snapshot loaded at start of request. Two
-- changes for the same NPC in the same turn → second upsert overwrote the
-- first's column. Flag upserts in a separate loop also clobbered disposition
-- updates and vice versa.
--
-- Solution: single SQL function takes the FULL set of changes for one NPC
-- (disposition deltas as jsonb axis→delta map + new flags) and atomically
-- merges using `jsonb_set` per-axis + array_append (deduped). Caller invokes
-- once per character per turn.
--
-- Parameters:
--   p_playthrough_id    — uuid of the playthrough
--   p_character_id      — uuid of the NPC (story_characters.id)
--   p_disposition_delta — jsonb { axis_name: delta_int, ... }, e.g.
--                         {"trust": 5, "romance": -10}; missing axes unchanged
--   p_new_flags         — text[] of flags to append (already-set flags skipped)
--   p_turn_index        — ai turn_index for tracking last_interaction_turn
--
-- Returns: void
-- ============================================================================
create or replace function public.apply_turn_npc_changes(
  p_playthrough_id uuid,
  p_character_id   uuid,
  p_disposition_delta jsonb,
  p_new_flags      text[],
  p_turn_index     integer
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  existing_row public.playthrough_character_states%rowtype;
  new_disposition jsonb;
  new_flags text[];
  axis_key text;
  delta_val numeric;
  cur_val numeric;
  applied numeric;
begin
  -- Lock the row for this (playthrough, character) so concurrent calls for
  -- the same NPC serialize cleanly. `for update` releases on commit.
  select * into existing_row
    from public.playthrough_character_states
    where playthrough_id = p_playthrough_id
      and character_id = p_character_id
    for update;

  if existing_row.playthrough_id is null then
    -- First time we're seeing this NPC for this playthrough — build base row.
    new_disposition := '{}'::jsonb;
    new_flags := array[]::text[];
  else
    new_disposition := coalesce(existing_row.disposition, '{}'::jsonb);
    new_flags := coalesce(existing_row.permanent_flags, array[]::text[]);
  end if;

  -- Apply disposition deltas atomically per axis (clamp -100..100)
  if p_disposition_delta is not null then
    for axis_key, delta_val in
      select key, (value)::text::numeric
        from jsonb_each_text(p_disposition_delta)
    loop
      cur_val := coalesce((new_disposition->>axis_key)::numeric, 0);
      applied := greatest(-100, least(100, cur_val + delta_val));
      new_disposition := jsonb_set(
        new_disposition,
        array[axis_key],
        to_jsonb(applied),
        true
      );
    end loop;
  end if;

  -- Append new flags (dedupe)
  if p_new_flags is not null then
    for axis_key in select unnest(p_new_flags)
    loop
      if not (axis_key = any(new_flags)) then
        new_flags := array_append(new_flags, axis_key);
      end if;
    end loop;
  end if;

  -- Single upsert with the merged result
  insert into public.playthrough_character_states (
    playthrough_id,
    character_id,
    disposition,
    permanent_flags,
    last_interaction_turn
  )
  values (
    p_playthrough_id,
    p_character_id,
    new_disposition,
    new_flags,
    p_turn_index
  )
  on conflict (playthrough_id, character_id)
  do update set
    disposition = excluded.disposition,
    permanent_flags = excluded.permanent_flags,
    last_interaction_turn = excluded.last_interaction_turn;
end;
$$;


-- ============================================================================
-- Grants — both functions called by authenticated users via PostgREST.
-- RLS is enforced by `security invoker` so users can only operate on their
-- own playthroughs.
-- ============================================================================
grant execute on function public.acquire_next_turn_pair(uuid) to authenticated;
grant execute on function public.apply_turn_npc_changes(uuid, uuid, jsonb, text[], integer) to authenticated;


-- ============================================================================
-- SANITY: smoke-test the functions exist (loud failure on apply if not)
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'acquire_next_turn_pair'
  ) then
    raise exception 'acquire_next_turn_pair RPC not created';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'apply_turn_npc_changes'
  ) then
    raise exception 'apply_turn_npc_changes RPC not created';
  end if;
end $$;
