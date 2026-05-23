-- Migration 0017 — Phase 6 + 1.5/2 polish 2nd audit cycle MED fix:
-- drop legacy 3-arg fork_story_to_playthrough overload
--
-- P6P2-DB-M-01 (2nd cycle Security/Correctness audit finding):
-- Migration 0016 used `create or replace function` to add the 4-arg signature
-- (p_llm_provider param) but Postgres function overloading means the old
-- 3-arg signature from Migrations 0009 + 0015 is NOT replaced — it coexists.
--
-- Problem: post-0016 prod has BOTH signatures:
--   (1) fork_story_to_playthrough(uuid, text, text)         — old, hardcodes 'anthropic'
--   (2) fork_story_to_playthrough(uuid, text, text, text)   — new (0016), uses p_llm_provider
--
-- The current legitimate caller (community/actions.ts forkStoryToPlaythrough)
-- passes all 4 named params → PostgREST resolves the 4-arg version correctly.
-- BUT: if any future caller (or attacker via PostgREST RPC introspection)
-- invokes the 3-arg signature with p_llm_provider omitted, the OLD version
-- executes and re-introduces the mis-attribution bug fix P6-HIGH-01 was
-- meant to close. Silent regression vector + RPC-surface bloat.
--
-- Also: Migration 0016 sanity check `prosrc like '%p_llm_provider%'` returned
-- 2 rows (passing despite the ghost) — that's a false-positive convergence
-- signal we want to stop in future migrations.
--
-- Fix: explicitly drop the 3-arg overload. The 4-arg version's default
-- `p_llm_provider text default 'anthropic'` already covers backward-compat
-- for any caller that omits the argument (PostgREST allows positional or
-- named arg calls into the 4-arg version with the 4th param using its default).
--
-- REQUIRES: 0001-0016 applied.


-- ============================================================================
-- Drop the legacy 3-arg overload (created by 0009, re-created by 0015)
-- ============================================================================
-- pg_get_function_identity_arguments returns DEFAULT-less signatures
-- (e.g., 'p_story_id uuid, p_character_name text, p_llm_model text'), so
-- match on argument-count + the absence of p_llm_provider.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'fork_story_to_playthrough'
      and p.pronargs = 3
  ) then
    drop function public.fork_story_to_playthrough(uuid, text, text);
    raise notice 'Dropped legacy 3-arg fork_story_to_playthrough overload';
  else
    raise notice 'Legacy 3-arg overload already gone (no-op)';
  end if;
end $$;


-- ============================================================================
-- SANITY — verify only the 4-arg signature remains
-- ============================================================================
do $$
declare
  v_overload_count int;
begin
  select count(*) into v_overload_count
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'fork_story_to_playthrough';

  if v_overload_count <> 1 then
    raise exception 'Expected exactly 1 fork_story_to_playthrough overload after Migration 0017, found %', v_overload_count;
  end if;

  -- Confirm the remaining one is the 4-arg version with p_llm_provider
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'fork_story_to_playthrough'
      and pg_get_function_identity_arguments(p.oid) like '%p_llm_provider%'
  ) then
    raise exception 'Remaining fork_story_to_playthrough overload missing p_llm_provider param';
  end if;
end $$;
