-- 0067 · 關鍵字 RPC match_count 上限 (M2 審計 I-1 · Session 19 · 2026-06-13)
-- 兩個 keyword RPC grant 咗俾 authenticated · 用戶可以經 PostgREST 直接呼叫並
-- 傳任意 p_match_count (RLS 限佢只睇到自己嘅行 · 但無上限 = 自貴查詢)。
-- 加 least(50) 上限 · retriever 正常用量 (5-12) 不受影響。

create or replace function public.match_lorebook_keyword(
  p_playthrough_id uuid,
  p_query text,
  p_match_count integer default 6
)
returns table (
  id uuid,
  entity_type text,
  name text,
  description text,
  kw_score double precision
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    le.id,
    le.entity_type,
    le.name,
    le.description,
    pgroonga_score(le.tableoid, le.ctid) as kw_score
  from public.lorebook_entries le
  where le.playthrough_id = p_playthrough_id
    and le.always_on = false
    and length(trim(coalesce(p_query, ''))) > 0
    and (le.name &@~ p_query or le.description &@~ p_query)
  order by kw_score desc
  limit least(greatest(coalesce(p_match_count, 0), 0), 50);
$$;

create or replace function public.match_turns_keyword(
  p_playthrough_id uuid,
  p_query text,
  p_match_count integer default 5,
  p_exclude_turn_indexes integer[] default '{}'
)
returns table (
  turn_id uuid,
  turn_index integer,
  role text,
  text text,
  kw_score double precision
)
language sql
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    t.id,
    t.turn_index,
    t.role,
    t.text,
    pgroonga_score(t.tableoid, t.ctid) as kw_score
  from public.turns t
  where t.playthrough_id = p_playthrough_id
    and length(trim(coalesce(p_query, ''))) > 0
    and coalesce(t.failed, false) = false
    and not (t.turn_index = any(coalesce(p_exclude_turn_indexes, '{}')))
    and t.text &@~ p_query
  order by kw_score desc
  limit least(greatest(coalesce(p_match_count, 0), 0), 50);
$$;

-- SANITY
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'match_turns_keyword' and prosrc like '%least(greatest%'
  ) then
    raise exception 'match_turns_keyword cap missing';
  end if;
end $$;
