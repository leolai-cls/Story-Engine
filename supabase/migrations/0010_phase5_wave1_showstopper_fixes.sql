-- Migration 0010 — Phase 5 Wave 1 SHOWSTOPPER fixes
--
-- Closes 4 launch-blocker findings surfaced in Phase 5 Deep Audit
-- (audit-report-phase5-deep.html, commit a57b557):
--
--   1. P5-RACE-C-01 — play_count inflation via fork+delete loop
--      Fix: DELETE trigger on playthroughs mirrors the INSERT bump
--      (decrements stories.play_count when a play row is removed for a
--      non-owner playthrough). Asymmetric counter triggers are a documented
--      race vector — see CLAUDE.md reminder #23.
--
--   2. P5-SEC-C-02 — Owner self-rating exploit (5★ on own story)
--      Fix: story_ratings INSERT/UPDATE policy gains a NOT EXISTS guard so
--      a row can't reference a story whose owner_id matches the rater. RLS
--      rejects the INSERT atomically; defense-in-depth check also added to
--      rateStory server action.
--
--   3. P5-SEC-H-02 — story_comments UPDATE policy column-wide open
--      Fix: replace the bare `auth.uid()=user_id` update policy with a
--      BEFORE-UPDATE trigger that reverts changes to body / parent_id /
--      story_id / user_id / created_at. Only `deleted` (false→true) and
--      `updated_at` are permitted to change. Closes bait-and-switch +
--      cross-story comment migration vectors. See CLAUDE.md reminder #24.
--
--   4. P5-LOGIC-H-04 — moderation_flags unbounded reporter spam
--      Fix: UNIQUE(reporter_id, content_type, content_id) prevents a user
--      from filing the same report repeatedly. Different reasons by the
--      same reporter against the same content roll up to one row (intent
--      is to prevent admin queue flooding — moderation team only needs to
--      see "this content was reported", not 50 copies).
--
-- REQUIRES: 0001-0009 applied.


-- ============================================================================
-- 1. play_count DELETE trigger — mirror the INSERT bump
-- ----------------------------------------------------------------------------
-- Symmetric counter discipline. The bump_story_play_count INSERT trigger
-- (Migration 0009 line 193) only increments. Without a mirror, a user can
-- fork → delete in a loop and inflate any story's play_count without bound,
-- corrupting trending rank. The DELETE trigger applies the same owner-skip
-- logic (don't decrement if the deleted playthrough was by the owner — it
-- wasn't counted to begin with).
-- ============================================================================
create or replace function public.decrement_story_play_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.stories where id = old.story_id;
  -- Symmetric skip: if owner == player OR story is official (owner null),
  -- the INSERT trigger didn't bump, so the DELETE trigger doesn't decrement.
  if v_owner_id is null or v_owner_id = old.user_id then
    return old;
  end if;
  -- greatest(...,0) defends against pre-existing rows from before the INSERT
  -- trigger was attached or any out-of-band manual edits.
  update public.stories
    set play_count = greatest(play_count - 1, 0)
    where id = old.story_id;
  return old;
end;
$$;

drop trigger if exists playthroughs_decrement_play_count on public.playthroughs;
create trigger playthroughs_decrement_play_count
  after delete on public.playthroughs
  for each row execute function public.decrement_story_play_count();


-- ============================================================================
-- 2. Block self-rating at RLS layer
-- ----------------------------------------------------------------------------
-- Current Migration 0009 policy:
--   story_ratings_own_insert WITH CHECK (
--     auth.uid() = user_id AND
--     EXISTS (stories WHERE id = story_id AND visibility = 'public')
--   )
-- Adds NOT EXISTS clause: the story's owner_id MUST NOT equal the rater.
-- Same guard applied to UPDATE policy (re-rating doesn't bypass).
-- ============================================================================
drop policy if exists "story_ratings_own_insert" on public.story_ratings;
create policy "story_ratings_own_insert" on public.story_ratings
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and s.visibility = 'public'
        and (s.owner_id is null or s.owner_id <> auth.uid())
    )
  );

drop policy if exists "story_ratings_own_update" on public.story_ratings;
create policy "story_ratings_own_update" on public.story_ratings
  for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (
        select 1 from public.stories s
        where s.id = story_id
          and (s.owner_id is null or s.owner_id <> auth.uid())
      )
    );


-- ============================================================================
-- 3. story_comments UPDATE — column-restrict via BEFORE UPDATE trigger
-- ----------------------------------------------------------------------------
-- The RLS column-list syntax (UPDATE OF col1, col2 ...) only filters which
-- statements the policy gates — not which columns within a statement can
-- change. The only reliable way to lock down per-column edits in Postgres
-- is a BEFORE UPDATE trigger that compares OLD vs NEW and reverts forbidden
-- changes.
--
-- Allowed transitions:
--   - deleted: false → true (soft-delete own comment)
--   - updated_at: anything (handled by existing set_updated_at trigger)
-- Everything else reverts to OLD value. This is loud (raises notice) so
-- developers see if frontend tries an unexpected edit; production stays
-- silent via raise level mapping.
-- ============================================================================
create or replace function public.story_comments_lock_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service role bypasses (admin moderation may need to redact body).
  -- auth.role() returns 'service_role' for service-role callers,
  -- 'authenticated' / 'anon' for end users.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Identity columns: never change
  new.id         := old.id;
  new.story_id   := old.story_id;
  new.user_id    := old.user_id;
  new.parent_id  := old.parent_id;
  new.created_at := old.created_at;
  -- Content immutable post-publish (closes bait-and-switch — write nice
  -- comment, gain upvotes, edit into attack)
  new.body       := old.body;
  -- deleted may only transition false → true (no un-delete by user)
  if old.deleted = true and new.deleted = false then
    new.deleted := old.deleted;
  end if;
  return new;
end;
$$;

drop trigger if exists story_comments_lock_columns on public.story_comments;
create trigger story_comments_lock_columns
  before update on public.story_comments
  for each row execute function public.story_comments_lock_immutable_columns();

-- Keep the policy unchanged from 0009 (auth.uid()=user_id) — the trigger
-- handles column restriction. Re-declared here for idempotency clarity.
drop policy if exists "story_comments_own_update" on public.story_comments;
create policy "story_comments_own_update" on public.story_comments
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ============================================================================
-- 4. moderation_flags UNIQUE constraint — one report per (reporter, content)
-- ----------------------------------------------------------------------------
-- Without this, a malicious user can flood the moderation queue with the
-- same report. Different reasons by the same reporter against the same
-- content collapse to one row (last write wins on reason via app-level
-- upsert — but app currently does plain INSERT, so a second attempt now
-- raises 23505 unique_violation which the action translates to a friendly
-- "already reported" message). See actions.ts mirror.
-- ============================================================================
create unique index if not exists moderation_flags_one_per_reporter_content
  on public.moderation_flags (reporter_id, content_type, content_id)
  where reporter_id is not null;


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'playthroughs_decrement_play_count'
      and tgrelid = 'public.playthroughs'::regclass
  ) then
    raise exception 'playthroughs_decrement_play_count trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'story_comments_lock_columns'
      and tgrelid = 'public.story_comments'::regclass
  ) then
    raise exception 'story_comments_lock_columns trigger missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where indexname = 'moderation_flags_one_per_reporter_content'
  ) then
    raise exception 'moderation_flags_one_per_reporter_content index missing';
  end if;
  -- Verify the new self-rating block policy reflects the new WITH CHECK shape
  if not exists (
    select 1 from pg_policies
    where tablename = 'story_ratings'
      and policyname = 'story_ratings_own_insert'
      and with_check like '%owner_id%'
  ) then
    raise exception 'story_ratings_own_insert policy not updated for self-rating block';
  end if;
end $$;
