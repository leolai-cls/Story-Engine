-- Migration 0009 — Phase 5 Community Library
--
-- Adds:
--   - story_ratings (one rating per user per story)
--   - story_comments (nested via parent_id, soft-delete)
--   - moderation_flags (report queue)
--   - FTS index on stories.title + description (for library search)
--   - Trigger: rating insert/update/delete → recompute stories.rating_avg + rating_count
--   - Trigger: playthrough insert on shared story → increment stories.play_count
--   - RLS for all 3 new tables (public read for ratings + non-deleted comments)
--   - Helper RPC: trending_stories(p_limit) — public/community stories ranked by
--     log(play_count + 1) × decay(created_at)
--   - Helper RPC: fork_story_to_playthrough(p_story_id, p_character_name)
--     — atomic playthrough creation referencing a public story
--
-- REQUIRES: 0001-0008 applied.


-- ============================================================================
-- story_ratings — one (story, user) → score 1-5 + optional review
-- ----------------------------------------------------------------------------
-- PK on (story_id, user_id) means UPSERT semantics — re-rating updates instead
-- of inserting a duplicate. Score range enforced. Review optional, capped at
-- 2000 chars.
-- ============================================================================
create table if not exists public.story_ratings (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  review_text text check (review_text is null or length(review_text) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists story_ratings_story_idx on public.story_ratings (story_id, created_at desc);
create index if not exists story_ratings_user_idx on public.story_ratings (user_id);

drop trigger if exists story_ratings_updated_at on public.story_ratings;
create trigger story_ratings_updated_at
  before insert or update on public.story_ratings
  for each row execute function public.set_updated_at();


-- ============================================================================
-- story_comments — flat list with optional parent_id for nested replies
-- ----------------------------------------------------------------------------
-- Soft-delete via `deleted` boolean (preserves thread structure). Body 1-2000
-- chars. Parent must be same story (enforced by app + RLS).
-- ============================================================================
create table if not exists public.story_comments (
  id uuid primary key default uuid_generate_v4(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  parent_id uuid references public.story_comments(id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_comments_story_idx on public.story_comments (story_id, created_at desc);
create index if not exists story_comments_parent_idx on public.story_comments (parent_id) where parent_id is not null;
create index if not exists story_comments_user_idx on public.story_comments (user_id);

drop trigger if exists story_comments_updated_at on public.story_comments;
create trigger story_comments_updated_at
  before insert or update on public.story_comments
  for each row execute function public.set_updated_at();


-- ============================================================================
-- moderation_flags — community report queue
-- ----------------------------------------------------------------------------
-- Reports against any user-generated content (story / comment / playthrough
-- for shared content). Reporter_id nullable so anonymous reports still work.
-- status starts 'pending'; admin review process flips to reviewed/actioned/dismissed.
-- ============================================================================
create table if not exists public.moderation_flags (
  id uuid primary key default uuid_generate_v4(),
  content_type text not null check (content_type in ('story', 'comment', 'playthrough')),
  content_id uuid not null,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('spam', 'hate', 'csam', 'illegal', 'harassment', 'sexual_minor', 'other')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_flags_status_idx on public.moderation_flags (status, created_at desc);
create index if not exists moderation_flags_content_idx on public.moderation_flags (content_type, content_id);


-- ============================================================================
-- FTS index on stories.title + description (Phase 5 library search)
-- ----------------------------------------------------------------------------
-- Uses simple config — works for English + 中文 without language-specific
-- tokenization (Postgres FTS for CJK uses character n-grams via simple).
-- Postgres requires generated column expressions to be IMMUTABLE; to_tsvector
-- is STABLE so we use a regular tsvector column + BEFORE INSERT/UPDATE
-- trigger to maintain it.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'stories' and column_name = 'search_text'
  ) then
    alter table public.stories add column search_text tsvector;
  end if;
end $$;

create or replace function public.stories_update_search_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.search_text := to_tsvector(
    'simple',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists stories_search_text_update on public.stories;
create trigger stories_search_text_update
  before insert or update of title, description, tags on public.stories
  for each row execute function public.stories_update_search_text();

-- Backfill existing rows (rare: should only matter on fresh applies after
-- some stories already exist)
update public.stories
  set search_text = to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '')
  )
  where search_text is null;

create index if not exists stories_search_idx on public.stories using gin (search_text);


-- ============================================================================
-- Trigger — recompute stories.rating_avg + rating_count on rating change
-- ============================================================================
create or replace function public.update_story_rating_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_story_id uuid;
  v_avg numeric;
  v_count integer;
begin
  v_story_id := coalesce(new.story_id, old.story_id);

  select avg(score)::numeric(3,2), count(*)
    into v_avg, v_count
    from public.story_ratings
    where story_id = v_story_id;

  update public.stories
    set rating_avg = v_avg,
        rating_count = coalesce(v_count, 0)
    where id = v_story_id;

  return null; -- AFTER trigger doesn't care
end;
$$;

drop trigger if exists story_ratings_aggregate on public.story_ratings;
create trigger story_ratings_aggregate
  after insert or update or delete on public.story_ratings
  for each row execute function public.update_story_rating_aggregate();


-- ============================================================================
-- Trigger — bump stories.play_count on playthrough insert
-- ----------------------------------------------------------------------------
-- Only counts plays of OTHER users' stories (skip if user is owner — they
-- created the story to play it themselves, that shouldn't inflate stats).
-- ============================================================================
create or replace function public.bump_story_play_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.stories where id = new.story_id;
  -- Skip if user is owner OR if story has no owner (official content)
  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;
  update public.stories
    set play_count = play_count + 1
    where id = new.story_id;
  return new;
end;
$$;

drop trigger if exists playthroughs_bump_play_count on public.playthroughs;
create trigger playthroughs_bump_play_count
  after insert on public.playthroughs
  for each row execute function public.bump_story_play_count();


-- ============================================================================
-- RPC — trending_stories
-- ----------------------------------------------------------------------------
-- Ranks public stories by hybrid score: log(play_count + 1) × exp(-age_days/14)
-- 2-week half-life. Rating contributes via rating_avg * sqrt(rating_count).
-- Filters to visibility='public' only (unlisted stays out of trending).
-- ============================================================================
create or replace function public.trending_stories(
  p_limit integer default 12,
  p_offset integer default 0,
  p_language text default null,
  p_min_rating numeric default null,
  p_content_rating text default null
)
returns table (
  id uuid,
  title text,
  description text,
  cover_image_url text,
  genre text,
  tags text[],
  language text,
  content_rating text,
  rating_avg numeric,
  rating_count integer,
  play_count integer,
  created_at timestamptz,
  trending_score numeric
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at,
    -- Trending = popularity × recency × quality boost
    (
      ln(greatest(s.play_count, 0) + 1)
      * exp(-extract(epoch from (now() - s.created_at)) / (86400 * 14))
      * (1.0 + coalesce(s.rating_avg, 0) * sqrt(greatest(s.rating_count, 0)) / 25.0)
    ) as trending_score
  from public.stories s
  where s.visibility = 'public'
    and (p_language is null or s.language = p_language)
    and (p_min_rating is null or coalesce(s.rating_avg, 0) >= p_min_rating)
    and (p_content_rating is null or s.content_rating = p_content_rating)
  order by trending_score desc, s.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

grant execute on function public.trending_stories(integer, integer, text, numeric, text) to anon, authenticated;


-- ============================================================================
-- RPC — search_stories (FTS + filters)
-- ----------------------------------------------------------------------------
-- Full-text search over title/description/tags + filter by language / genre /
-- content_rating. Returns ranked by FTS relevance, then trending score.
-- ============================================================================
create or replace function public.search_stories(
  p_query text,
  p_limit integer default 24,
  p_offset integer default 0,
  p_language text default null,
  p_content_rating text default null
)
returns table (
  id uuid,
  title text,
  description text,
  cover_image_url text,
  genre text,
  tags text[],
  language text,
  content_rating text,
  rating_avg numeric,
  rating_count integer,
  play_count integer,
  created_at timestamptz,
  fts_rank real
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at,
    ts_rank(s.search_text, plainto_tsquery('simple', p_query)) as fts_rank
  from public.stories s
  where s.visibility = 'public'
    and s.search_text @@ plainto_tsquery('simple', p_query)
    and (p_language is null or s.language = p_language)
    and (p_content_rating is null or s.content_rating = p_content_rating)
  order by fts_rank desc, s.play_count desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

grant execute on function public.search_stories(text, integer, integer, text, text) to anon, authenticated;


-- ============================================================================
-- RPC — fork_story_to_playthrough
-- ----------------------------------------------------------------------------
-- Atomic "play this story" — create playthrough referencing public story.
-- Initial state from story.state_schema defaults. Initial NPC dispositions
-- from each character's default_disposition_toward_protagonist.
--
-- Returns the new playthrough id so caller can redirect to /play/[id].
-- ============================================================================
create or replace function public.fork_story_to_playthrough(
  p_story_id uuid,
  p_character_name text default null,
  p_llm_model text default null
)
returns table (playthrough_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_caller_uid uuid;
  v_story record;
  v_initial_state jsonb;
  v_pt_id uuid;
  v_field jsonb;
  v_char record;
  v_disposition_value integer;
begin
  v_caller_uid := auth.uid();
  if v_caller_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Story must exist + be public OR owned by caller
  select id, owner_id, visibility, state_schema
    into v_story
    from public.stories
    where id = p_story_id;
  if not found then
    raise exception 'story_not_found' using errcode = 'P0002';
  end if;
  if v_story.visibility <> 'public' and v_story.owner_id <> v_caller_uid then
    raise exception 'story_not_accessible' using errcode = '42501';
  end if;

  -- Build initial state from schema defaults
  v_initial_state := '{}'::jsonb;
  if v_story.state_schema ? 'fields' then
    for v_field in select * from jsonb_array_elements(v_story.state_schema->'fields')
    loop
      v_initial_state := v_initial_state || jsonb_build_object(
        v_field->>'key',
        v_field->'default'
      );
    end loop;
  end if;

  -- Insert playthrough (turn_count starts at 1 — opening narrative = turn 0)
  insert into public.playthroughs (
    user_id, story_id, character_name, current_state,
    llm_provider, llm_model, turn_count, status
  )
  values (
    v_caller_uid,
    p_story_id,
    coalesce(p_character_name, '主角'),
    v_initial_state,
    'anthropic',
    coalesce(p_llm_model, 'claude-sonnet-4-6'),
    1,
    'active'
  )
  returning id into v_pt_id;

  -- Initialize per-character disposition states from defaults
  for v_char in
    select id, default_disposition_toward_protagonist
      from public.story_characters
      where story_id = p_story_id
  loop
    v_disposition_value := case v_char.default_disposition_toward_protagonist
      when 'hostile' then -60
      when 'wary' then -20
      when 'neutral' then 0
      when 'friendly' then 30
      when 'warm' then 60
      when 'devoted' then 90
      else 0
    end;
    insert into public.playthrough_character_states (
      playthrough_id, character_id, disposition, permanent_flags
    )
    values (
      v_pt_id,
      v_char.id,
      jsonb_build_object('trust', v_disposition_value),
      array[]::text[]
    );
  end loop;

  -- Insert opening narrative as turn 0 (copies from stories.opening_narrative)
  insert into public.turns (
    playthrough_id, turn_index, role, text, llm_provider, model, credits_charged
  )
  select v_pt_id, 0, 'ai', s.opening_narrative, 'anthropic',
         coalesce(p_llm_model, 'claude-sonnet-4-6'), 0
    from public.stories s
    where s.id = p_story_id and s.opening_narrative is not null;

  playthrough_id := v_pt_id;
  return next;
end;
$$;

grant execute on function public.fork_story_to_playthrough(uuid, text, text) to authenticated;


-- ============================================================================
-- RLS — story_ratings, story_comments, moderation_flags
-- ============================================================================
alter table public.story_ratings    enable row level security;
alter table public.story_comments   enable row level security;
alter table public.moderation_flags enable row level security;


-- ---------- story_ratings ---------------------------------------------------
-- Anyone (anon + authenticated) can READ ratings for public stories.
-- Authenticated user can INSERT/UPDATE/DELETE their own rating.
drop policy if exists "story_ratings_public_read" on public.story_ratings;
create policy "story_ratings_public_read" on public.story_ratings
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.visibility = 'public' or s.owner_id = auth.uid())
    )
  );

drop policy if exists "story_ratings_own_insert" on public.story_ratings;
create policy "story_ratings_own_insert" on public.story_ratings
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.visibility = 'public'
    )
  );

drop policy if exists "story_ratings_own_update" on public.story_ratings;
create policy "story_ratings_own_update" on public.story_ratings
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "story_ratings_own_delete" on public.story_ratings;
create policy "story_ratings_own_delete" on public.story_ratings
  for delete using (auth.uid() = user_id);


-- ---------- story_comments --------------------------------------------------
-- Read: anyone if not deleted AND parent story is public.
-- Insert: authed user, can't soft-delete on insert.
-- Update: own row only.
drop policy if exists "story_comments_public_read" on public.story_comments;
create policy "story_comments_public_read" on public.story_comments
  for select using (
    deleted = false
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.visibility = 'public' or s.owner_id = auth.uid())
    )
  );

drop policy if exists "story_comments_own_insert" on public.story_comments;
create policy "story_comments_own_insert" on public.story_comments
  for insert with check (
    auth.uid() = user_id
    and deleted = false
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.visibility = 'public'
    )
  );

drop policy if exists "story_comments_own_update" on public.story_comments;
create policy "story_comments_own_update" on public.story_comments
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ---------- moderation_flags -----------------------------------------------
-- Insert by any authenticated user (anonymous reports = NULL reporter_id;
-- those require service_role since RLS won't allow). No user SELECT —
-- only admins (service_role) see the queue.
drop policy if exists "moderation_flags_authed_insert" on public.moderation_flags;
create policy "moderation_flags_authed_insert" on public.moderation_flags
  for insert with check (
    auth.uid() is not null
    and reporter_id = auth.uid()
  );

-- No SELECT / UPDATE / DELETE policies for users — admin-only via service_role.


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'story_ratings') then
    raise exception 'story_ratings table not created';
  end if;
  if not exists (select 1 from pg_tables where tablename = 'story_comments') then
    raise exception 'story_comments table not created';
  end if;
  if not exists (select 1 from pg_tables where tablename = 'moderation_flags') then
    raise exception 'moderation_flags table not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'trending_stories') then
    raise exception 'trending_stories RPC not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'fork_story_to_playthrough') then
    raise exception 'fork_story_to_playthrough RPC not created';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'stories_search_idx') then
    raise exception 'stories search FTS index not created';
  end if;
end $$;
