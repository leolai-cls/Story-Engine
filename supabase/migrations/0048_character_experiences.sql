-- 0048 · 角色經歷日誌 (Character Soul M1 · pm/architecture/03 + IMPLEMENTATION)
--
-- 2026-06-01: 角色靈魂第 2 層「經歷日誌」。每個有意義嘅回合之後 · 背景層
-- (service-role) 為「升級咗」嘅 active 角色寫一條經歷 entry。記低件事 + 角色
-- 嘅回應 + 影響權重 · 之後 RAG 拉返餵俾 Narrator · 等角色 base on 累積經歷
-- 推導反應 (而唔係查 trait list)。
--
-- 動態升級 (founder #2): 唔靜態標主要角色。角色累積夠互動 (出場次數) 先「長出」
-- 經歷日誌。playthrough_character_states 加 interaction_count 計數。路人甲冇日誌。
--
-- RLS: 跟 Migration 0018 memory lockdown — user 只可 SELECT 自己 playthrough 嘅
-- 經歷 (Memory Journal 可睇)；INSERT/UPDATE 由 server service-role 做 (bypass RLS)。

-- ============================================================================
-- character_experiences — 角色經歷日誌 (第 2 層靈魂)
-- ============================================================================
create table if not exists public.character_experiences (
  id uuid primary key default extensions.uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  character_id uuid not null references public.story_characters(id) on delete cascade,
  turn_index integer not null,
  -- 件事 (客觀發生咗咩 · 從呢個角色 POV)
  what_happened text not null,
  -- 角色嘅回應 / 決定 (佢點消化呢件事)
  my_response text,
  -- 件事對佢嘅影響有幾大 (0-1) · 沉澱張力 (M2) 用嚟計 threshold
  weight real not null default 0.5 check (weight >= 0 and weight <= 1),
  -- 情感色彩 (e.g. 「震撼+感激」)
  emotional_tone text,
  -- 影響到角色嘅邊啲方面 (e.g. ["對主角嘅信任"])
  affects text[] not null default array[]::text[],
  -- RAG retrieve 用 (by current-scene similarity)
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

-- Per-playthrough + per-character listing (Memory Journal + prep retrieval)
create index if not exists char_exp_pt_char_idx
  on public.character_experiences (playthrough_id, character_id);

-- High-weight milestone fast-path (清潔系統壓縮時保留 high-weight · 見 07)
create index if not exists char_exp_milestone_idx
  on public.character_experiences (playthrough_id, character_id)
  where weight >= 0.7;

-- HNSW cosine index for RAG (embedding nullable · partial index skips nulls)
create index if not exists char_exp_embedding_idx
  on public.character_experiences
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

-- ============================================================================
-- 動態升級 · interaction_count (founder #2)
-- ============================================================================
-- playthrough_character_states 已有 last_interaction_turn。加一個累積計數 ·
-- 用嚟決定角色幾時「升級」開始有經歷日誌 (初版 threshold: 出場 >= 3 次)。
alter table public.playthrough_character_states
  add column if not exists interaction_count integer not null default 0;

comment on column public.playthrough_character_states.interaction_count is
  '角色累積互動次數。動態升級用：>= 3 先開始寫經歷日誌 (Character Soul M1)。路人甲永遠唔升級。';

-- ============================================================================
-- RLS — user SELECT only · server service-role 寫 (跟 0018 lockdown)
-- ============================================================================
alter table public.character_experiences enable row level security;

drop policy if exists "char_exp_own_select" on public.character_experiences;
create policy "char_exp_own_select" on public.character_experiences
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );
-- NO user INSERT/UPDATE/DELETE policy — server service-role bypasses RLS (0018 pattern).

-- ============================================================================
-- RPC — match_character_experiences (cosine similarity · prep retrieval)
-- ============================================================================
-- SECURITY INVOKER → RLS applies (user 只攞到自己 playthrough)。返一個角色嘅
-- 相關經歷 by similarity · 有 floor (角色記憶比 general lorebook 更需要精準)。
create or replace function public.match_character_experiences(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_min_similarity real default 0.5
)
returns table (
  id uuid,
  turn_index integer,
  what_happened text,
  my_response text,
  weight real,
  emotional_tone text,
  similarity real
)
language sql
stable
as $$
  select
    e.id,
    e.turn_index,
    e.what_happened,
    e.my_response,
    e.weight,
    e.emotional_tone,
    (1 - (e.embedding <=> p_query_embedding))::real as similarity
  from public.character_experiences e
  where e.playthrough_id = p_playthrough_id
    and e.character_id = p_character_id
    and e.embedding is not null
    and (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;
