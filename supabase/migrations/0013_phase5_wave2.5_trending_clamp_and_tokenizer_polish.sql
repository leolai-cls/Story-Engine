-- Migration 0013 — Phase 5 Wave 2.5 trending clamp + stories INSERT lock + tokenizer polish
--
-- Closes Wave 2 audit ship blockers:
--
--   W2-TREND-H-01 — Trending board exploitable via direct stories INSERT
--     with future created_at. The newcomer boost `exp(-age_days / 3)` has
--     no clamp; future created_at makes the exponent positive and the
--     score blows up. Stories INSERT RLS (Migration 0002) has no column-
--     list restriction, so client can supply any column including future
--     created_at, visibility='public' (bypass moderation), play_count
--     (inflate), rating_avg (fake quality).
--     Fix (two layers):
--       (a) Clamp the time delta in BOTH the newcomer boost AND the recency
--           decay terms: greatest(0, now() - created_at). Defends even if
--           insertion gap is closed elsewhere.
--       (b) BEFORE INSERT trigger on stories that forces server-controlled
--           columns to known-safe values for end-user callers:
--             created_at := now()
--             visibility := 'private' (publish requires explicit publishStory)
--             play_count, rating_avg, rating_count := 0 / null
--             search_text := null (existing search_text trigger fills it)
--           Service role bypass (createStory action runs server-side via the
--           authenticated user's client, NOT service-role — so the trigger
--           applies. Future SECURITY DEFINER createStory RPC will be granted
--           to service_role and skip this trigger).
--
--   W2-FTS-M-09 — Bigram tokenizer doesn't strip zero-width chars before
--     iterating. ZWJ-injected titles index a different bigram set than
--     normal queries → search misses. Fix: regexp_replace zero-width
--     characters at the top of cjk_bigram_tokenize before iteration.
--
--   W2-FTS-M-10 — Single CJK char query (e.g. '的') matches everything
--     because tokenizer emits every CJK char as a unigram alongside its
--     bigram. Fix: drop the single-char emit — only emit bigrams. Side
--     effect: single-char queries return zero results. Library UI shows
--     a "請輸入至少 2 字" hint (Wave 2.5 UI patch). This is the right
--     trade-off: 1-char queries are not useful searches anyway.
--
--   W2-MOD-L-11 — Dead variable `last_was_cjk` in tokenizer. Cleanup.
--
-- REQUIRES: 0001-0012 applied.


-- ============================================================================
-- 1. Tokenizer rewrite — ZWJ strip + bigram-only emission
-- ----------------------------------------------------------------------------
-- Backward compatibility: search index was built with single-char unigrams
-- (Migration 0012). After this migration:
--   - New / updated rows: indexed with bigram-only tokens
--   - Existing rows: re-tokenized via the backfill UPDATE at the bottom
--   - Old single-char tokens in the index disappear after backfill
-- Query side: queries also use the new tokenizer → same set of tokens →
-- matching works correctly.
-- ============================================================================
create or replace function public.cjk_bigram_tokenize(input text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
declare
  cjk_re text := '[぀-ヿ㐀-䶿一-鿿가-힯]';
  i integer;
  ch text;
  next_ch text;
  result_arr text[] := array[]::text[];
  word_buffer text := '';
  normalized text;
begin
  if input is null or length(input) = 0 then return ''; end if;

  -- W2-FTS-M-09: strip zero-width / formatting chars before iteration so
  -- adversarial ZWJ-injected text indexes the same bigrams as the normal
  -- surface text. Chars stripped: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ),
  -- U+2060 (word joiner), U+FEFF (BOM / zero-width no-break space).
  normalized := regexp_replace(input, '[​-‍⁠﻿]', '', 'g');

  for i in 1..length(normalized) loop
    ch := substring(normalized from i for 1);
    if ch ~ cjk_re then
      -- Flush any pending Latin word
      if length(word_buffer) > 0 then
        result_arr := array_append(result_arr, word_buffer);
        word_buffer := '';
      end if;
      -- W2-FTS-M-10: bigram-only emission — DROP the single-char unigram
      -- emit. Generate bigram with NEXT char if next is also CJK. Lone CJK
      -- chars at end of run are NOT emitted (1-char queries return 0).
      if i < length(normalized) then
        next_ch := substring(normalized from i + 1 for 1);
        if next_ch ~ cjk_re then
          result_arr := array_append(result_arr, ch || next_ch);
        end if;
      end if;
    else
      -- Non-CJK: accumulate Latin/digit, flush on punctuation/whitespace
      if ch ~ '[A-Za-z0-9]' then
        word_buffer := word_buffer || lower(ch);
      else
        if length(word_buffer) > 0 then
          result_arr := array_append(result_arr, word_buffer);
          word_buffer := '';
        end if;
      end if;
    end if;
  end loop;

  if length(word_buffer) > 0 then
    result_arr := array_append(result_arr, word_buffer);
  end if;

  return array_to_string(result_arr, ' ');
end;
$$;

-- Backfill existing rows — the new tokenizer outputs different tokens
update public.stories
  set search_text = to_tsvector(
    'simple',
    public.cjk_bigram_tokenize(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')
    )
  );


-- ============================================================================
-- 2. Trending formula clamps — defend against future created_at exploit
-- ----------------------------------------------------------------------------
-- W2-TREND-H-01: even with the INSERT trigger below, defense-in-depth on
-- the formula itself protects against any future hole. Both the recency
-- decay term and the newcomer boost wrap the time delta in greatest(0, ...)
-- so future timestamps clamp to "now" and never explode the exponent.
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
      ln(greatest(s.play_count, 0) + 1)
      -- W2-TREND-H-01: clamp time delta to non-negative (future created_at
      -- would otherwise make exponent positive and blow up the score)
      * exp(-greatest(0, extract(epoch from (now() - s.created_at))) / (86400 * 14))
      * (1.0 + coalesce(s.rating_avg, 0) * sqrt(greatest(s.rating_count, 0)) / 25.0)
      -- Newcomer boost: same clamp applied
      + exp(-greatest(0, extract(epoch from (now() - s.created_at))) / (86400 * 3))
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

-- Same clamp applied to stories_by_genre (uses the same formula)
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
      * exp(-greatest(0, extract(epoch from (now() - s.created_at))) / (86400 * 14))
      * (1.0 + coalesce(s.rating_avg, 0) * sqrt(greatest(s.rating_count, 0)) / 25.0)
      + exp(-greatest(0, extract(epoch from (now() - s.created_at))) / (86400 * 3))
    ) as trending_score
  from public.stories s
  where s.visibility = 'public'
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


-- ============================================================================
-- 3. stories BEFORE INSERT trigger — lock server-controlled columns
-- ----------------------------------------------------------------------------
-- W2-TREND-H-01: even with formula clamp, a direct INSERT can still poison
-- the trending board by supplying play_count=99999, rating_avg=5.0, or by
-- skipping moderation via visibility='public' at INSERT time. Defense:
-- force these columns to server-controlled defaults for non-service-role
-- callers.
--
-- Service role bypass — the legitimate createStory server action OR a
-- future SECURITY DEFINER create RPC needs to set things like visibility
-- on its own behalf. Today's createStory uses authenticated client (not
-- service_role) and only sets visibility='private' anyway, so this trigger
-- silently corrects any client tampering without breaking the action.
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
  -- (existing publishStory in actions.ts already validates ownership)
  new.visibility := 'private';

  -- Counter / aggregate columns: must come from triggers, not client
  new.play_count := 0;
  new.rating_avg := null;
  new.rating_count := 0;

  -- search_text is filled by the stories_search_text_update trigger
  new.search_text := null;

  -- owner_id MUST match auth.uid() — RLS already enforces this, but make it
  -- explicit (also catches the case where RLS is somehow off)
  new.owner_id := auth.uid();

  return new;
end;
$$;

drop trigger if exists stories_lock_server_columns_insert on public.stories;
create trigger stories_lock_server_columns_insert
  before insert on public.stories
  for each row execute function public.stories_lock_server_columns_on_insert();


-- ============================================================================
-- SANITY
-- ============================================================================
do $$
declare
  v_test_tokens text;
begin
  -- Tokenizer: ZWJ strip + bigram-only
  v_test_tokens := public.cjk_bigram_tokenize('校' || chr(8203) || '園戀愛');
  -- Should produce '校園 園戀 戀愛' (ZWJ stripped, bigrams only, no single chars)
  if v_test_tokens not like '%校園%' or v_test_tokens not like '%戀愛%' then
    raise exception 'tokenizer ZWJ-strip or bigram emission broken: got %', v_test_tokens;
  end if;
  if v_test_tokens like '%校 %' or v_test_tokens like '% 校 %' or v_test_tokens like '% 校' then
    raise exception 'tokenizer still emits single CJK chars: %', v_test_tokens;
  end if;

  -- Single CJK char input → empty result (no bigram possible)
  v_test_tokens := public.cjk_bigram_tokenize('的');
  if v_test_tokens <> '' then
    raise exception 'single CJK char should emit empty, got: %', v_test_tokens;
  end if;

  -- Trigger exists
  if not exists (
    select 1 from pg_trigger
    where tgname = 'stories_lock_server_columns_insert'
      and tgrelid = 'public.stories'::regclass
  ) then
    raise exception 'stories_lock_server_columns_insert trigger missing';
  end if;

  -- trending RPC formula contains the clamp
  if not exists (
    select 1 from pg_proc
    where proname = 'trending_stories'
      and prosrc like '%greatest(0, extract%'
  ) then
    raise exception 'trending_stories RPC missing the clamp';
  end if;
end $$;
