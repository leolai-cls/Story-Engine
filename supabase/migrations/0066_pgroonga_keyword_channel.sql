-- 0066 · PGroonga 中文關鍵字檢索通道 (deep-plan 第 2 波 M2 · Session 19 · 2026-06-13)
--
-- 解 04-memory.md 講嘅「篩漏」盲點:而家記憶檢索純靠 embedding 相似度揀候選,
-- 關鍵字只係幫「已揀中嘅候選」重新排位 — 相似度搵唔到嘅,關鍵字永遠睇唔到。
-- (真實例:玩家提返好耐之前嘅一件小物,句子好短 → 相似度落喺 floor 之下 → AI「唔記得」)
--
-- 呢個 migration 開第二條獨立檢索通道:PGroonga 原生 CJK 全文索引,query 由
-- retriever 用既有 extractTokens (CJK bigram) 砌 "a OR b OR c"。Retriever 將兩條
-- 通道結果合併 (lorebook = hybrid 評分 · RAG turns = RRF 融合)。
--
-- REQUIRES: 0064 (pgroonga extension) applied。
-- Resilient deploy (hard rule #12): retriever 對呢兩個 RPC 有 missing-fallback ·
-- code 先行 deploy 都唔會爆。

-- ── 索引 ────────────────────────────────────────────────────────────────────
-- PGroonga 預設 TokenBigram tokenizer · 中日文原生支援 (hard rule #25 嘅正解)。
create index if not exists lorebook_entries_pgroonga_name
  on public.lorebook_entries using pgroonga (name);
create index if not exists lorebook_entries_pgroonga_description
  on public.lorebook_entries using pgroonga (description);
create index if not exists turns_pgroonga_text
  on public.turns using pgroonga (text);

-- ── RPC:lorebook 關鍵字通道 ────────────────────────────────────────────────
-- security invoker → RLS 照行 (lorebook_entries scoped by playthrough owner)。
-- always_on=false 同 vector 版 match_lorebook_entries 一致 (always-on 另有通道)。
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
  limit greatest(coalesce(p_match_count, 0), 0);
$$;

grant execute on function public.match_lorebook_keyword(uuid, text, integer) to authenticated;

-- ── RPC:過去回合關鍵字通道 ─────────────────────────────────────────────────
-- 同 vector 版 match_turn_embeddings 一致:排除近期回合;另外跳過 failed 回合
-- (誠實失敗原則 · 失敗殘留唔應該俾 AI 引用)。
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
  limit greatest(coalesce(p_match_count, 0), 0);
$$;

grant execute on function public.match_turns_keyword(uuid, text, integer, integer[]) to authenticated;

-- ── SANITY ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgroonga') then
    raise exception 'pgroonga extension missing — apply 0064 first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'match_lorebook_keyword') then
    raise exception 'match_lorebook_keyword missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'match_turns_keyword') then
    raise exception 'match_turns_keyword missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'turns_pgroonga_text') then
    raise exception 'turns_pgroonga_text index missing';
  end if;
end $$;
