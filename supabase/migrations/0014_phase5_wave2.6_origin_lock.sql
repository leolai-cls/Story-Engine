-- Migration 0014 — Phase 5 Wave 2.6 origin lock on INSERT trigger
--
-- W2.5-SEC-L-04 (defense-in-depth): the stories_lock_server_columns_on_insert
-- trigger introduced in Migration 0013 locks 8 server-controlled columns
-- (created_at / updated_at / visibility / play_count / rating_avg /
-- rating_count / search_text / owner_id) for non-service-role callers.
-- It does NOT lock `origin`.
--
-- Today origin has no read-side effect (the 0001 special-read policy was
-- dropped in 0002). But any future feature that gates behavior on
-- `stories.origin = 'official'` (Official badge, Official-only events,
-- promoted carousels, trust signals) becomes immediately exploitable
-- without this lock — a regular user could INSERT with origin='official'
-- and inherit the trust without going through service-role admin tooling.
--
-- Lock it now. CLAUDE.md reminder #22: every column the trigger DOESN'T
-- lock is an admission of trust in client input. We don't trust origin
-- input from regular users.
--
-- Service-role bypass preserved — Founder + Claude writing official
-- content via service-role client (Phase 7 content tier) can still set
-- origin='official' or 'curated'.
--
-- REQUIRES: 0001-0013 applied.


-- ============================================================================
-- Replace stories_lock_server_columns_on_insert to also lock `origin`
-- ============================================================================
create or replace function public.stories_lock_server_columns_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Server-controlled time columns
  new.created_at := now();
  new.updated_at := now();

  -- Visibility starts private — must use publishStory action to flip to public
  new.visibility := 'private';

  -- Counter / aggregate columns: must come from triggers, not client
  new.play_count := 0;
  new.rating_avg := null;
  new.rating_count := 0;

  -- search_text is filled by the stories_search_text_update trigger
  new.search_text := null;

  -- owner_id MUST match auth.uid()
  new.owner_id := auth.uid();

  -- W2.5-SEC-L-04 (Wave 2.6): origin reserved for Founder-managed content.
  -- Regular users always create user-origin stories. Service role (Phase 7
  -- official content path) bypasses this trigger and can set 'official'.
  new.origin := 'user';

  return new;
end;
$$;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'stories_lock_server_columns_on_insert'
      and prosrc like '%new.origin := ''user''%'
  ) then
    raise exception 'stories_lock_server_columns_on_insert did not include origin lock';
  end if;
end $$;
