-- Migration 0012 — Phase 5 Wave 2 search + trending + audit polish
--
-- Closes P5 audit findings that were Wave-2-class deferred from earlier waves:
--
--   P5-LOGIC-H-03 — FTS 'simple' config doesn't tokenize CJK characters
--     (CLAUDE.md reminder #25). Whitespace-only tokenization turns
--     '校園戀愛' into a single token, breaking HK + TW market #1 search.
--     Fix: stories_update_search_text trigger now generates bigrams from
--     CJK chars (2-char rolling window) and unions with Latin-word tokens.
--
--   P5-LOGIC-H-02 — Trending formula `ln(plays + 1)` gives 0 for new
--     content (CLAUDE.md reminder #26). Cold-start dead-end: new story
--     never appears on trending → never gets plays → never appears.
--     Fix: trending_stories RPC adds newcomer boost term
--     `exp(-age_days / 3)` with 3-day half-life — new stories ranked
--     by freshness during their first ~10 days, popularity takes over after.
--
--   W1-REGRESS-H-05 — story_comments lock trigger silent revert. Phase 5
--     UI tier will add comment edit; the silent revert returns 200 OK with
--     stale data. Fix: trigger now RAISES EXCEPTION on disallowed change.
--
--   W1-RLS-M-04 — story_ratings UPDATE WITH CHECK missing visibility=public
--     consistency. INSERT requires public; UPDATE allowed on any visibility.
--     Fix: UPDATE WITH CHECK adds the same constraint.
--
-- REQUIRES: 0001-0011 applied.


-- ============================================================================
-- 1. CJK bigram tokenization for FTS (P5-LOGIC-H-03)
-- ----------------------------------------------------------------------------
-- The 'simple' tsearch config splits on whitespace and punctuation only.
-- CJK languages have no whitespace between words, so the entire title
-- '一個 1980 年代香港古惑仔故事' becomes a small handful of tokens, none of
-- which match a query like '古惑仔' or '校園戀愛'.
--
-- Standard solution: bigram (2-character n-grams) for CJK chars + simple
-- tokenization for Latin/digits. Query side does the same bigram split, so
-- exact substring matches work via FTS @@ operator.
--
-- Implementation: regex-replace each CJK char block to space-separated
-- bigrams, then feed to to_tsvector('simple', ...). Example:
--   '校園戀愛' → '校園 園戀 戀愛'   (3 bigrams from 4 chars)
--   '香港' → '香港'                  (1 bigram from 2 chars)
--   '一' → '一'                       (1 unigram from 1 char — keep as-is)
-- ============================================================================

create or replace function public.cjk_bigram_tokenize(input text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
declare
  -- CJK Unified Ideographs: U+4E00 to U+9FFF
  -- CJK Extension A: U+3400 to U+4DBF
  -- Hiragana: U+3040 to U+309F · Katakana: U+30A0 to U+30FF
  -- Hangul Syllables: U+AC00 to U+D7AF
  cjk_re text := '[぀-ヿ㐀-䶿一-鿿가-힯]';
  i integer;
  ch text;
  next_ch text;
  result_arr text[] := array[]::text[];
  last_was_cjk boolean := false;
  word_buffer text := '';
begin
  if input is null or length(input) = 0 then return ''; end if;

  for i in 1..length(input) loop
    ch := substring(input from i for 1);
    if ch ~ cjk_re then
      -- Flush any pending Latin word
      if length(word_buffer) > 0 then
        result_arr := array_append(result_arr, word_buffer);
        word_buffer := '';
      end if;
      -- Generate bigram with NEXT char if next is also CJK
      if i < length(input) then
        next_ch := substring(input from i + 1 for 1);
        if next_ch ~ cjk_re then
          result_arr := array_append(result_arr, ch || next_ch);
        end if;
      end if;
      -- Also emit single char (so 1-char queries hit + final char stands alone)
      result_arr := array_append(result_arr, ch);
      last_was_cjk := true;
    else
      -- Non-CJK: accumulate into word buffer (Latin/digit/punct)
      if ch ~ '[A-Za-z0-9]' then
        word_buffer := word_buffer || lower(ch);
      else
        -- Whitespace / punctuation: flush buffer
        if length(word_buffer) > 0 then
          result_arr := array_append(result_arr, word_buffer);
          word_buffer := '';
        end if;
      end if;
      last_was_cjk := false;
    end if;
  end loop;

  -- Flush final word buffer
  if length(word_buffer) > 0 then
    result_arr := array_append(result_arr, word_buffer);
  end if;

  return array_to_string(result_arr, ' ');
end;
$$;

-- Rewrite the search_text trigger to use bigram tokenization
create or replace function public.stories_update_search_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_combined text;
  v_tokenized text;
begin
  v_combined :=
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '');
  v_tokenized := public.cjk_bigram_tokenize(v_combined);
  new.search_text := to_tsvector('simple', v_tokenized);
  return new;
end;
$$;

-- Backfill existing rows (rare — only affects rows already in DB at apply time)
update public.stories
  set search_text = to_tsvector(
    'simple',
    public.cjk_bigram_tokenize(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')
    )
  );

-- Rewrite search_stories RPC to apply same bigram tokenization on QUERY side
-- (must match index side for FTS @@ operator to hit)
create or replace function public.search_stories(
  p_query          text,
  p_limit          integer default 24,
  p_offset         integer default 0,
  p_language       text default null,
  p_content_rating text default null
)
returns table (
  id              uuid,
  title           text,
  description     text,
  cover_image_url text,
  genre           text,
  tags            text[],
  language        text,
  content_rating  text,
  rating_avg      numeric,
  rating_count    integer,
  play_count      integer,
  created_at      timestamptz,
  fts_rank        real
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at,
    ts_rank(
      s.search_text,
      plainto_tsquery('simple', public.cjk_bigram_tokenize(p_query))
    ) as fts_rank
  from public.stories s
  where s.visibility = 'public'
    and s.search_text @@ plainto_tsquery('simple', public.cjk_bigram_tokenize(p_query))
    and (p_language is null or s.language = p_language)
    and (p_content_rating is null or s.content_rating = p_content_rating)
  order by fts_rank desc, s.play_count desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;


-- ============================================================================
-- 2. Trending cold-start newcomer boost (P5-LOGIC-H-02)
-- ----------------------------------------------------------------------------
-- Current formula: ln(play_count + 1) × exp(-age/14) × quality
-- New stories: ln(0 + 1) = 0 → trending_score = 0 → never on board.
--
-- Fix: ADD newcomer boost term — exp(-age_days / 3). Half-life 3 days means
-- a 0-play story scores ~1.0 at hour 0, ~0.5 at day 3, ~0.05 at day 10.
-- After ~10 days, popularity dominates again. Boost is summed (not multiplied)
-- so a story with high play_count + recent date scores both.
--
-- Formula: trending_score =
--   ln(plays + 1) × exp(-age_days / 14) × quality_boost
--   + exp(-age_days / 3)                            -- NEW: newcomer boost
-- ============================================================================
create or replace function public.trending_stories(
  p_limit          integer default 12,
  p_offset         integer default 0,
  p_language       text default null,
  p_min_rating     numeric default null,
  p_content_rating text default null
)
returns table (
  id              uuid,
  title           text,
  description     text,
  cover_image_url text,
  genre           text,
  tags            text[],
  language        text,
  content_rating  text,
  rating_avg      numeric,
  rating_count    integer,
  play_count      integer,
  created_at      timestamptz,
  trending_score  numeric
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at,
    (
      -- Popularity × recency × quality
      ln(greatest(s.play_count, 0) + 1)
      * exp(-extract(epoch from (now() - s.created_at)) / (86400 * 14))
      * (1.0 + coalesce(s.rating_avg, 0) * sqrt(greatest(s.rating_count, 0)) / 25.0)
      -- Newcomer boost: 3-day half-life freshness term
      + exp(-extract(epoch from (now() - s.created_at)) / (86400 * 3))
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


-- ============================================================================
-- 3. Multi-board genre carousel RPCs
-- ----------------------------------------------------------------------------
-- Library page (Wave 2 UI) shows multiple genre/freshness carousels. Each
-- needs a small RPC for efficient SQL-side filtering + ordering.
--
-- - `latest_stories` — pure ORDER BY created_at desc, no scoring
-- - `stories_by_genre` — filter by genre column, ordered by trending score
-- ============================================================================
create or replace function public.latest_stories(
  p_limit          integer default 12,
  p_language       text default null,
  p_content_rating text default null
)
returns table (
  id              uuid,
  title           text,
  description     text,
  cover_image_url text,
  genre           text,
  tags            text[],
  language        text,
  content_rating  text,
  rating_avg      numeric,
  rating_count    integer,
  play_count      integer,
  created_at      timestamptz
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at
  from public.stories s
  where s.visibility = 'public'
    and (p_language is null or s.language = p_language)
    and (p_content_rating is null or s.content_rating = p_content_rating)
  order by s.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.latest_stories(integer, text, text) to anon, authenticated;

create or replace function public.stories_by_genre(
  p_genre          text,
  p_limit          integer default 12,
  p_offset         integer default 0,
  p_language       text default null,
  p_content_rating text default null
)
returns table (
  id              uuid,
  title           text,
  description     text,
  cover_image_url text,
  genre           text,
  tags            text[],
  language        text,
  content_rating  text,
  rating_avg      numeric,
  rating_count    integer,
  play_count      integer,
  created_at      timestamptz,
  trending_score  numeric
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id, s.title, s.description, s.cover_image_url, s.genre, s.tags,
    s.language, s.content_rating, s.rating_avg, s.rating_count, s.play_count,
    s.created_at,
    (
      ln(greatest(s.play_count, 0) + 1)
      * exp(-extract(epoch from (now() - s.created_at)) / (86400 * 14))
      * (1.0 + coalesce(s.rating_avg, 0) * sqrt(greatest(s.rating_count, 0)) / 25.0)
      + exp(-extract(epoch from (now() - s.created_at)) / (86400 * 3))
    ) as trending_score
  from public.stories s
  where s.visibility = 'public'
    -- Match by genre column OR by tags array containing the genre term
    -- (e.g., "love" is genre=romance but also tagged "戀愛")
    and (
      lower(coalesce(s.genre, '')) = lower(p_genre)
      or p_genre = any(s.tags)
      or lower(p_genre) = any(array(select lower(unnest(s.tags))))
    )
    and (p_language is null or s.language = p_language)
    and (p_content_rating is null or s.content_rating = p_content_rating)
  order by trending_score desc, s.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

grant execute on function public.stories_by_genre(text, integer, integer, text, text) to anon, authenticated;


-- ============================================================================
-- 4. story_comments lock trigger — RAISE EXCEPTION instead of silent revert
-- ----------------------------------------------------------------------------
-- W1-REGRESS-H-05: previous trigger silently reverted forbidden column
-- changes. UPDATE returned 200 OK with old data, action returned ok:true.
-- Phase 5 UI tier will add edit comment — zombie success bug. Fix: RAISE
-- EXCEPTION on any disallowed change, force the client to surface a real
-- error.
-- ============================================================================
create or replace function public.story_comments_lock_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service role bypasses (admin moderation may need to redact body).
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Identity columns: hard-fail any attempted change (loud beats silent)
  if new.id is distinct from old.id then
    raise exception 'immutable_column_change_attempted: id' using errcode = '42501';
  end if;
  if new.story_id is distinct from old.story_id then
    raise exception 'immutable_column_change_attempted: story_id' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'immutable_column_change_attempted: user_id' using errcode = '42501';
  end if;
  if new.parent_id is distinct from old.parent_id then
    raise exception 'immutable_column_change_attempted: parent_id' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'immutable_column_change_attempted: created_at' using errcode = '42501';
  end if;
  -- Body is frozen post-publish — bait-and-switch defense
  if new.body is distinct from old.body then
    raise exception 'immutable_column_change_attempted: body' using errcode = '42501';
  end if;
  -- deleted: only false → true (no un-delete by user). NULL coerced via
  -- schema NOT NULL so we don't need to handle that case here.
  if coalesce(old.deleted, false) = true and coalesce(new.deleted, false) = false then
    raise exception 'cannot_undelete_comment' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- Trigger declaration unchanged (still BEFORE UPDATE on story_comments)


-- ============================================================================
-- 5. story_ratings UPDATE WITH CHECK visibility consistency (W1-RLS-M-04)
-- ----------------------------------------------------------------------------
-- Note: with Migration 0011 REVOKE, end-user direct UPDATE is already
-- blocked. RPC path goes through service_role bypass. But for completeness
-- + future-proofing if INSERT/UPDATE is ever regranted, the policy should
-- match INSERT semantics.
-- ============================================================================
drop policy if exists "story_ratings_own_update" on public.story_ratings;
create policy "story_ratings_own_update" on public.story_ratings
  for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (
        select 1 from public.stories s
        where s.id = story_id
          and s.visibility = 'public'
          and (s.owner_id is null or s.owner_id <> auth.uid())
      )
    );


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
declare
  v_test_search text;
  v_test_ts tsvector;
begin
  -- Bigram tokenizer smoke test
  v_test_search := public.cjk_bigram_tokenize('校園戀愛 1980 古惑仔');
  if v_test_search not like '%校園%' or v_test_search not like '%古惑%' then
    raise exception 'cjk_bigram_tokenize did not emit expected bigrams: %', v_test_search;
  end if;

  -- FTS query smoke test — '校園戀愛' should match 'TW 校園戀愛故事'
  v_test_ts := to_tsvector('simple', public.cjk_bigram_tokenize('TW 大學校園戀愛故事'));
  if not (v_test_ts @@ plainto_tsquery('simple', public.cjk_bigram_tokenize('校園戀愛'))) then
    raise exception 'CJK bigram FTS roundtrip failed';
  end if;

  -- RPCs exist
  if not exists (select 1 from pg_proc where proname = 'latest_stories') then
    raise exception 'latest_stories RPC missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'stories_by_genre') then
    raise exception 'stories_by_genre RPC missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'cjk_bigram_tokenize') then
    raise exception 'cjk_bigram_tokenize fn missing';
  end if;
end $$;
