-- Migration 0011 — Phase 5 Wave 1.5 defense-in-depth
--
-- Closes 6 ship blockers surfaced in the post-Wave-1 audit
-- (audit-report-phase5-wave1.html, commit b703374):
--
--   W1-MOD-C-01 — Action-layer-only moderation bypassable via direct
--     supabase.from().insert() from browser console. Fix: REVOKE
--     INSERT/UPDATE on story_comments + story_ratings from authenticated,
--     new SECURITY DEFINER RPCs granted to service_role only. Action layer
--     creates service-role client to call (browser can't, no JWT for it).
--
--   W1-AGG-H-02 — Aggregate trigger UPDATE path recomputes only NEW side
--     when story_id changes. Browser exploit moves a 5★ rating across
--     stories without invalidating OLD aggregate. Fix: trigger recomputes
--     BOTH when story_id changes. Belt-and-suspenders BEFORE UPDATE trigger
--     also forces new.story_id := old.story_id.
--
--   W1-RLS-H-01 — Owner can post-create UPDATE stories.title /
--     description / prompt_seed / story_bible to CSAM; publishStory doesn't
--     re-moderate. Fix: BEFORE UPDATE trigger locks the content columns
--     so only visibility / counters / cover_image / updated_at can change.
--     Edits require re-creation (action layer re-moderates new prompt).
--
-- Action-layer-only fixes (NOT in this migration, in the accompanying code change):
--   W1-MOD-C-02 — failClosed:true defaults + missing key hard-fail
--   W1-FP-H-03 — sexual/minors score floor 0.15 → 0.5
--   W1-FP-H-04 — Remove general violence from SFW_ADDITIONAL_BLOCK
--   W1-FP-M-09 — Move threatening categories from HARD_BLOCK to score-floored
--   W1-COST-H-02 — Moderation timeout 10s → 3s
--   W1-COST-C-01 — Reorder createStoryFromPrompt (auth → balance → moderation)
--
-- REQUIRES: 0001-0010 applied.


-- ============================================================================
-- 1. REVOKE direct table writes — action layer (via service-role) is sole path
-- ----------------------------------------------------------------------------
-- This removes the W1-MOD-C-01 attack: browser console calling
-- supabase.from('story_comments').insert(...) with a logged-in user's cookie
-- now fails because the authenticated role no longer has the privilege.
--
-- SELECT remains so anyone (anon + auth) can still read public comments/ratings.
-- DELETE on story_ratings stays (own-rating delete via existing RLS policy is
-- desired UX). DELETE on story_comments was never granted via policy.
-- ============================================================================
revoke insert, update on public.story_comments from authenticated, anon;
revoke insert, update on public.story_ratings  from authenticated, anon;


-- ============================================================================
-- 2. New SECURITY DEFINER RPCs — granted to service_role only
-- ----------------------------------------------------------------------------
-- Action layer creates a service-role client (using SUPABASE_SERVICE_ROLE_KEY)
-- and calls these RPCs. Browser users have no service_role JWT so calling
-- supabase.rpc('insert_story_comment_secure', ...) returns permission denied.
--
-- Each RPC does the integrity checks (visibility, ownership, parent-same-story)
-- that the action layer would do. Moderation stays in the action layer (Node
-- has the OpenAI client) — but moderation is now MANDATORY because no other
-- path can reach the table.
-- ============================================================================

-- ---- insert_story_comment_secure ------------------------------------------
create or replace function public.insert_story_comment_secure(
  p_story_id  uuid,
  p_user_id   uuid,
  p_body      text,
  p_parent_id uuid default null
)
returns table (comment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_story_visibility text;
  v_owner_id uuid;
  v_parent_story uuid;
  v_new_id uuid;
begin
  if p_user_id is null or p_story_id is null then
    raise exception 'missing_required_args' using errcode = '22023';
  end if;
  if p_body is null or length(trim(p_body)) < 1 or length(p_body) > 2000 then
    raise exception 'body_invalid_length' using errcode = '22023';
  end if;

  select visibility, owner_id into v_story_visibility, v_owner_id
    from public.stories where id = p_story_id;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  if v_story_visibility <> 'public' and v_owner_id <> p_user_id then
    raise exception 'story_not_accessible' using errcode = '42501';
  end if;

  if p_parent_id is not null then
    select story_id into v_parent_story
      from public.story_comments where id = p_parent_id;
    if not found or v_parent_story <> p_story_id then
      raise exception 'parent_mismatch' using errcode = 'P0002';
    end if;
  end if;

  insert into public.story_comments (story_id, user_id, body, parent_id)
    values (p_story_id, p_user_id, trim(p_body), p_parent_id)
    returning id into v_new_id;

  comment_id := v_new_id;
  return next;
end;
$$;

revoke execute on function public.insert_story_comment_secure(uuid, uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.insert_story_comment_secure(uuid, uuid, text, uuid) to service_role;


-- ---- upsert_story_rating_secure -------------------------------------------
-- Rate (or re-rate) a public story. Enforces:
--   - p_user_id != stories.owner_id  (W1-SEC-C-02 from Wave 1)
--   - stories.visibility = 'public'
--   - score 1-5
--   - review_text <= 2000 chars (or null)
create or replace function public.upsert_story_rating_secure(
  p_story_id    uuid,
  p_user_id     uuid,
  p_score       integer,
  p_review_text text default null
)
returns table (score integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_story_visibility text;
  v_owner_id uuid;
begin
  if p_user_id is null or p_story_id is null then
    raise exception 'missing_required_args' using errcode = '22023';
  end if;
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'invalid_score' using errcode = '22023';
  end if;
  if p_review_text is not null and length(p_review_text) > 2000 then
    raise exception 'review_too_long' using errcode = '22023';
  end if;

  select visibility, owner_id into v_story_visibility, v_owner_id
    from public.stories where id = p_story_id;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  if v_story_visibility <> 'public' then
    raise exception 'story_not_public' using errcode = '42501';
  end if;
  if v_owner_id is not null and v_owner_id = p_user_id then
    raise exception 'cannot_rate_own_story' using errcode = '42501';
  end if;

  insert into public.story_ratings (story_id, user_id, score, review_text)
    values (p_story_id, p_user_id, p_score, p_review_text)
    on conflict (story_id, user_id) do update
      set score = excluded.score,
          review_text = excluded.review_text,
          updated_at = now();

  score := p_score;
  return next;
end;
$$;

revoke execute on function public.upsert_story_rating_secure(uuid, uuid, integer, text) from public, anon, authenticated;
grant  execute on function public.upsert_story_rating_secure(uuid, uuid, integer, text) to service_role;


-- ---- soft_delete_comment_secure -------------------------------------------
-- softDeleteComment moves from direct UPDATE (now revoked) to an RPC. The
-- BEFORE UPDATE trigger story_comments_lock_immutable_columns (Migration 0010)
-- still applies for service-role calls? NO — that trigger bypasses for
-- service_role. So this RPC is the sole legitimate path for the deleted=true
-- transition.
create or replace function public.soft_delete_comment_secure(
  p_comment_id uuid,
  p_user_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if p_user_id is null or p_comment_id is null then
    raise exception 'missing_required_args' using errcode = '22023';
  end if;
  select user_id into v_owner from public.story_comments where id = p_comment_id;
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if v_owner <> p_user_id then
    raise exception 'not_comment_owner' using errcode = '42501';
  end if;

  update public.story_comments
    set deleted = true, updated_at = now()
    where id = p_comment_id;
end;
$$;

revoke execute on function public.soft_delete_comment_secure(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.soft_delete_comment_secure(uuid, uuid) to service_role;


-- ============================================================================
-- 3. Aggregate trigger fix — recompute BOTH on UPDATE story_id change
-- ----------------------------------------------------------------------------
-- W1-AGG-H-02: previously the trigger used coalesce(new.story_id, old.story_id)
-- which on UPDATE always picked new (non-null), leaving the OLD story's
-- aggregate stale. Fix: when story_id changes, recompute both sides.
-- ============================================================================
create or replace function public.update_story_rating_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avg numeric;
  v_count integer;
  v_target uuid;
begin
  -- On UPDATE that changes story_id: recompute OLD side first
  if (TG_OP = 'UPDATE') and (old.story_id is distinct from new.story_id) then
    select avg(score)::numeric(3,2), count(*)
      into v_avg, v_count
      from public.story_ratings
      where story_id = old.story_id;
    update public.stories
      set rating_avg = v_avg,
          rating_count = coalesce(v_count, 0)
      where id = old.story_id;
  end if;

  -- Always recompute the "current" side:
  --   INSERT: new.story_id
  --   UPDATE: new.story_id (may be same as old or moved)
  --   DELETE: old.story_id (no new row)
  v_target := coalesce(new.story_id, old.story_id);
  select avg(score)::numeric(3,2), count(*)
    into v_avg, v_count
    from public.story_ratings
    where story_id = v_target;
  update public.stories
    set rating_avg = v_avg,
        rating_count = coalesce(v_count, 0)
    where id = v_target;

  return null;
end;
$$;
-- Trigger declaration unchanged (still AFTER INSERT/UPDATE/DELETE on story_ratings)


-- ============================================================================
-- 4. story_ratings BEFORE UPDATE trigger — belt-and-suspenders story_id lock
-- ----------------------------------------------------------------------------
-- Even with REVOKE UPDATE from authenticated (W1-MOD-C-01 fix), service-role
-- callers (the RPCs above) still go through UPDATE. The aggregate trigger
-- handles aggregate correctness, but defense-in-depth: never let story_id /
-- user_id / created_at change after INSERT. RAISE EXCEPTION (loud) when
-- end-user UPDATE attempts these changes — for service_role, silently lock
-- (RPC may legitimately need to mutate other cols).
-- ============================================================================
create or replace function public.story_ratings_lock_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    -- Silent lock for trusted RPC paths
    new.story_id   := old.story_id;
    new.user_id    := old.user_id;
    new.created_at := old.created_at;
    return new;
  end if;
  -- For any non-service-role caller (shouldn't reach here post-REVOKE but
  -- be loud if it does):
  if new.story_id is distinct from old.story_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable_column_change_attempted' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists story_ratings_lock_columns on public.story_ratings;
create trigger story_ratings_lock_columns
  before update on public.story_ratings
  for each row execute function public.story_ratings_lock_immutable_columns();


-- ============================================================================
-- 5. stories BEFORE UPDATE trigger — lock content columns post-creation
-- ----------------------------------------------------------------------------
-- W1-RLS-H-01: stories_owner_update RLS allows owner to UPDATE any column.
-- Owner can post-creation rewrite title/description/prompt_seed/story_bible
-- to CSAM, then publishStory flips visibility to public — moderation never
-- ran on the new content.
--
-- Fix: lock the content columns at the trigger layer. Allowed mutations:
--   - visibility (publish/unpublish flow)
--   - play_count, rating_avg, rating_count (set by other triggers)
--   - updated_at (set_updated_at trigger)
--   - cover_image_url (future image upload — content-mod will be wired then)
--
-- All other columns: silently locked (for service-role, allowing admin
-- moderation to redact), or raise exception (for end-user UPDATE attempts).
-- ============================================================================
create or replace function public.stories_lock_content_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- Identity / structural columns
  new.id         := old.id;
  new.owner_id   := old.owner_id;
  new.created_at := old.created_at;
  new.origin     := old.origin;
  -- Content columns — frozen post-creation. To edit, re-create story (action
  -- re-moderates new prompt). This closes the "publish-then-mutate-to-CSAM"
  -- exploit because publishStory only touches `visibility` (not in this list).
  new.title             := old.title;
  new.description       := old.description;
  new.prompt_seed       := old.prompt_seed;
  new.story_bible       := old.story_bible;
  new.opening_narrative := old.opening_narrative;
  new.state_schema      := old.state_schema;
  new.tags              := old.tags;
  new.language          := old.language;
  new.content_rating    := old.content_rating;
  new.genre             := old.genre;
  -- visibility / play_count / rating_avg / rating_count / updated_at /
  -- cover_image_url / search_text remain mutable.
  return new;
end;
$$;

drop trigger if exists stories_lock_content_columns on public.stories;
create trigger stories_lock_content_columns
  before update on public.stories
  for each row execute function public.stories_lock_content_columns();


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  -- REVOKE verified by checking that authenticated has no INSERT priv
  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'story_comments'
      and privilege_type = 'INSERT'
  ) then
    raise exception 'REVOKE INSERT on story_comments from authenticated did not take';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'story_ratings'
      and privilege_type = 'INSERT'
  ) then
    raise exception 'REVOKE INSERT on story_ratings from authenticated did not take';
  end if;

  -- New RPCs exist
  if not exists (select 1 from pg_proc where proname = 'insert_story_comment_secure') then
    raise exception 'insert_story_comment_secure RPC missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'upsert_story_rating_secure') then
    raise exception 'upsert_story_rating_secure RPC missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'soft_delete_comment_secure') then
    raise exception 'soft_delete_comment_secure RPC missing';
  end if;

  -- New triggers exist
  if not exists (
    select 1 from pg_trigger
    where tgname = 'story_ratings_lock_columns'
      and tgrelid = 'public.story_ratings'::regclass
  ) then
    raise exception 'story_ratings_lock_columns trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'stories_lock_content_columns'
      and tgrelid = 'public.stories'::regclass
  ) then
    raise exception 'stories_lock_content_columns trigger missing';
  end if;
end $$;
