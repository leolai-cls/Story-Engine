-- Migration 0002 — Foundation Audit Hardening
--
-- Addresses audit findings from `audit-report-foundation-deep.html` covering
-- DB + RLS + indexes + extensions. Applied AFTER 0001 (which created the base
-- schema). Safe to re-run (idempotent guards on every block).
--
-- Findings addressed:
--   SEC-C-01  Add `with check` to all write policies (cross-user INSERT/UPDATE)
--   SEC-H-01  profiles INSERT/DELETE policies + `with check` on update
--   SEC-H-02  CHECK constraint: adult_mode_enabled implies is_age_verified
--             + trigger preventing self-elevation of sensitive columns
--   SEC-H-05  Drop redundant `stories_official_read` policy
--   SEC-L-02  Revoke EXECUTE on SECURITY DEFINER functions from public/anon
--   DB-C-02   handle_new_user EXCEPTION block — anonymous sign-ins + idempotent
--   DB-H-01   profiles INSERT/DELETE policies (same as SEC-H-01)
--   DB-H-02   Drop `unlisted` from stories_public_read (link-only, not searchable)
--   DB-H-05   Composite + partial indexes for hot query paths
--   DB-M-02   Triggers BEFORE INSERT OR UPDATE (was UPDATE only)
--   DB-M-05   Split turns + pcs `for all` into select/insert (no DELETE/UPDATE for non-admin)
--   DB-M-06   Enable pgvector extension (Phase 2 prep)
--   AI-L-02   UNIQUE constraint on story_characters(story_id, lower(name))
--
-- NOT in this migration (deferred):
--   AI-C-01 / DB-H-04   Atomic NPC merge RPC      → Wave 5 (0003_atomic_rpcs.sql)
--   AI-C-03 / DB-H-03   Atomic turn pair RPC      → Wave 5
--   DB-M-04             __act → playthroughs.current_act column → later
--   DB-C-01             Regenerate TS types        → Wave 7 (CLI)


-- ============================================================================
-- Extensions: pgvector for Phase 2 memory layer
-- ============================================================================
create extension if not exists vector with schema extensions;


-- ============================================================================
-- DB-C-02 — handle_new_user idempotency + anonymous sign-in safety
-- ----------------------------------------------------------------------------
-- 0001's trigger had no exception handler. If it ever re-fired for the same
-- user (rare but possible: manual delete-and-recreate, Supabase auth replay),
-- the UNIQUE constraint on profiles.id would explode and prevent the user
-- from signing up at all. Anonymous sign-ins also have NULL email — the
-- COALESCE chain ends with `new.email = NULL`, which is fine for the column
-- (nullable), but we wrap in EXCEPTION to be safe.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      new.email
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  return new;
exception
  when unique_violation then
    -- Profile already exists — treat as no-op so the auth flow continues.
    return new;
  when others then
    -- Log via Postgres notice but don't block sign-up.
    raise warning '[handle_new_user] profile insert failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;


-- ============================================================================
-- SEC-L-02 — Restrict SECURITY DEFINER functions from anon/authenticated
-- ----------------------------------------------------------------------------
-- Defense in depth: even though the functions only make sense from trigger
-- context, anon shouldn't be able to call them directly via PostgREST.
-- ============================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;


-- ============================================================================
-- DB-M-02 — Triggers: BEFORE INSERT OR UPDATE (was UPDATE only)
-- ----------------------------------------------------------------------------
-- Defense in depth. Current default `now()` populates updated_at on insert
-- correctly, but if a future migration drops the default, INSERTs would
-- silently break the invariant. Make the trigger handle both paths.
-- ============================================================================
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before insert or update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists stories_updated_at on public.stories;
create trigger stories_updated_at
  before insert or update on public.stories
  for each row execute function public.set_updated_at();

drop trigger if exists pcs_updated_at on public.playthrough_character_states;
create trigger pcs_updated_at
  before insert or update on public.playthrough_character_states
  for each row execute function public.set_updated_at();


-- ============================================================================
-- SEC-H-02 — Adult mode / age verification at DB layer
-- ----------------------------------------------------------------------------
-- (a) CHECK constraint: adult_mode_enabled requires is_age_verified.
-- (b) Trigger blocks self-elevation of sensitive columns
--     (is_age_verified, credit_balance, credit_period_end, subscription_tier).
--     Service role bypasses RLS so admin webhooks (Stripe Identity, billing)
--     can still update via direct SQL.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_adult_requires_age'
  ) then
    alter table public.profiles
      add constraint profiles_adult_requires_age
      check (adult_mode_enabled = false or is_age_verified = true);
  end if;
end $$;

-- Trigger function that reverts unauthorized changes to sensitive columns.
-- Allow if:
--   (a) JWT role is `service_role` (Supabase admin via PostgREST), OR
--   (b) session_user is NOT `authenticated` / `anon` (direct SQL by postgres
--       admin role, edge function with service role connection, etc).
-- Block otherwise — authenticated app users can't elevate themselves.
create or replace function public.protect_sensitive_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  caller_session text;
begin
  caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  caller_session := session_user::text;
  if caller_role = 'service_role'
     or caller_session not in ('authenticated', 'anon') then
    return new;
  end if;

  -- For non-admin callers, revert any change to sensitive columns.
  if new.is_age_verified is distinct from old.is_age_verified then
    new.is_age_verified := old.is_age_verified;
  end if;
  if new.adult_mode_enabled is distinct from old.adult_mode_enabled then
    -- adult_mode_enabled CAN be flipped by user IFF is_age_verified is true
    -- (the CHECK constraint enforces this). So we allow the change here.
    -- Just enforce the dependency: false → true requires is_age_verified.
    if new.adult_mode_enabled = true and new.is_age_verified = false then
      new.adult_mode_enabled := false;
    end if;
  end if;
  if new.credit_balance is distinct from old.credit_balance then
    new.credit_balance := old.credit_balance;
  end if;
  if new.credit_period_end is distinct from old.credit_period_end then
    new.credit_period_end := old.credit_period_end;
  end if;
  if new.subscription_tier is distinct from old.subscription_tier then
    new.subscription_tier := old.subscription_tier;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_sensitive_profile_columns() from public, anon, authenticated;

drop trigger if exists profiles_protect_sensitive on public.profiles;
create trigger profiles_protect_sensitive
  before update on public.profiles
  for each row execute function public.protect_sensitive_profile_columns();


-- ============================================================================
-- AI-L-02 — UNIQUE on story_characters(story_id, lower(name))
-- ----------------------------------------------------------------------------
-- LLM occasionally generates two characters with same name; charByName map
-- in turn-runner returns first match only and the second NPC becomes a phantom.
-- Use a functional UNIQUE index (case-insensitive).
-- ============================================================================
create unique index if not exists story_characters_unique_name
  on public.story_characters (story_id, lower(name));


-- ============================================================================
-- DB-H-05 — Missing indexes for hot query paths
-- ============================================================================
-- Official story landing query (origin=official AND visibility != 'private')
create index if not exists stories_official_visible_idx
  on public.stories (created_at desc)
  where origin = 'official' and visibility in ('public', 'unlisted');

-- Phase 2 will hammer this when building rolling summaries
create index if not exists turns_by_role_idx
  on public.turns (playthrough_id, role, turn_index);

-- Phase 5 community: "people playing this story recently"
create index if not exists playthroughs_story_recent_idx
  on public.playthroughs (story_id, created_at desc);


-- ============================================================================
-- RLS REWORK — drop and recreate all policies with `with check` clauses
-- and split for-all into select/insert/update/delete where appropriate.
-- ============================================================================

-- ---------- profiles (SEC-H-01, DB-H-01) ------------------------------------
drop policy if exists "profiles_own_read"   on public.profiles;
drop policy if exists "profiles_own_update" on public.profiles;
drop policy if exists "profiles_own_insert" on public.profiles;
drop policy if exists "profiles_own_delete" on public.profiles;

create policy "profiles_own_read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_own_insert" on public.profiles
  for insert with check (auth.uid() = id);

-- UPDATE: `using` filters which rows the user can see for update;
-- `with check` validates the post-update row state — user can't change `id`.
create policy "profiles_own_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_own_delete" on public.profiles
  for delete using (auth.uid() = id);


-- ---------- stories (SEC-C-01, SEC-H-05, DB-H-02) ---------------------------
drop policy if exists "stories_owner_all"      on public.stories;
drop policy if exists "stories_public_read"    on public.stories;
drop policy if exists "stories_official_read"  on public.stories;
drop policy if exists "stories_owner_select"   on public.stories;
drop policy if exists "stories_owner_insert"   on public.stories;
drop policy if exists "stories_owner_update"   on public.stories;
drop policy if exists "stories_owner_delete"   on public.stories;

create policy "stories_owner_select" on public.stories
  for select using (auth.uid() = owner_id);

-- Public read: PUBLIC ONLY. `unlisted` was previously listable via
-- `select * from stories where visibility='unlisted'` — that made it
-- identical to public at the RLS layer. App-level share-link is the
-- correct gate for `unlisted`.
create policy "stories_public_read" on public.stories
  for select using (visibility = 'public');

-- Owners can insert their own stories — `with check` prevents inserting
-- a row attributed to another user.
create policy "stories_owner_insert" on public.stories
  for insert with check (auth.uid() = owner_id);

create policy "stories_owner_update" on public.stories
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "stories_owner_delete" on public.stories
  for delete using (auth.uid() = owner_id);

-- (stories_official_read dropped — was redundant with stories_public_read
-- when origin=official + visibility=public, and incorrect for visibility=
-- private — owner_select handles that.)


-- ---------- story_characters (SEC-C-01) -------------------------------------
drop policy if exists "story_characters_read_via_story"  on public.story_characters;
drop policy if exists "story_characters_owner_write"     on public.story_characters;
drop policy if exists "story_characters_owner_insert"    on public.story_characters;
drop policy if exists "story_characters_owner_update"    on public.story_characters;
drop policy if exists "story_characters_owner_delete"    on public.story_characters;

create policy "story_characters_read_via_story" on public.story_characters
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
      and (s.owner_id = auth.uid() or s.visibility = 'public')
    )
  );

create policy "story_characters_owner_insert" on public.story_characters
  for insert with check (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.owner_id = auth.uid()
    )
  );

create policy "story_characters_owner_update" on public.story_characters
  for update
    using (
      exists (
        select 1 from public.stories s
        where s.id = story_id and s.owner_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.stories s
        where s.id = story_id and s.owner_id = auth.uid()
      )
    );

create policy "story_characters_owner_delete" on public.story_characters
  for delete using (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.owner_id = auth.uid()
    )
  );


-- ---------- playthroughs (SEC-C-01) -----------------------------------------
drop policy if exists "playthroughs_own_all"     on public.playthroughs;
drop policy if exists "playthroughs_own_select"  on public.playthroughs;
drop policy if exists "playthroughs_own_insert"  on public.playthroughs;
drop policy if exists "playthroughs_own_update"  on public.playthroughs;
drop policy if exists "playthroughs_own_delete"  on public.playthroughs;

create policy "playthroughs_own_select" on public.playthroughs
  for select using (auth.uid() = user_id);

create policy "playthroughs_own_insert" on public.playthroughs
  for insert with check (auth.uid() = user_id);

create policy "playthroughs_own_update" on public.playthroughs
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "playthroughs_own_delete" on public.playthroughs
  for delete using (auth.uid() = user_id);


-- ---------- playthrough_character_states (SEC-C-01, DB-M-05) ----------------
-- Per CLAUDE.md "ledger append-only" spirit + Phase 2 RAG safety: don't let
-- users DELETE pcs rows. UPDATE allowed (disposition changes per turn).
drop policy if exists "pcs_own_all"     on public.playthrough_character_states;
drop policy if exists "pcs_own_select"  on public.playthrough_character_states;
drop policy if exists "pcs_own_insert"  on public.playthrough_character_states;
drop policy if exists "pcs_own_update"  on public.playthrough_character_states;

create policy "pcs_own_select" on public.playthrough_character_states
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "pcs_own_insert" on public.playthrough_character_states
  for insert with check (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "pcs_own_update" on public.playthrough_character_states
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

-- No DELETE policy intentionally — Phase 2 RAG will reference these via FK,
-- and CLAUDE.md says NPC state is part of the append-only ledger contract.


-- ---------- turns (SEC-C-01, DB-M-05) ---------------------------------------
-- Append-only ledger: SELECT + INSERT only. No UPDATE / DELETE for users.
-- Phase 2 RAG embeddings will reference turns.id via FK; deletion would
-- orphan vectors and corrupt memory retrieval.
drop policy if exists "turns_own_all"     on public.turns;
drop policy if exists "turns_own_select"  on public.turns;
drop policy if exists "turns_own_insert"  on public.turns;

create policy "turns_own_select" on public.turns
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

create policy "turns_own_insert" on public.turns
  for insert with check (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE policies — append-only.


-- ============================================================================
-- SANITY CHECKS
-- ============================================================================
-- Confirm pgvector available
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    raise exception 'pgvector extension was not enabled — Phase 2 will fail';
  end if;
end $$;

-- Confirm UNIQUE constraint applied (loud failure if collision in existing data)
-- If this fails on apply, existing story_characters has duplicates and needs
-- a dedupe pass before migration can complete.
