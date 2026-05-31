-- 0050 · 角色信念圖譜 (Character Soul M3 · pm/architecture/04)
--
-- 2026-06-01: temporal 信念圖譜。⚠️ 範圍收窄 (founder 2026-06-01)：只記**事實性、
-- 需要前後一致、AI 容易記漏**嘅信念 — 例如「陳家明 以為 主角死咗」。
-- **唔記性格/情緒/價值** (嗰啲會壓扁角色 · 留出身故事 + 經歷日誌 · 見 03)。
-- 呢個係一致性工具 · 唔係性格工具 · 防 AI 跨幾十回合記漏一個事實而穿崩。
--
-- Temporal: 新信念 insert (valid_to=null)。信念被推翻 → set valid_to=now ·
-- invalidated_by_turn (唔 delete · 保留歷史)。point-in-time query 攞當前有效嗰個。
-- 參考 MemPalace knowledge_graph.py。

create table if not exists public.character_beliefs (
  id uuid primary key default extensions.uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  character_id uuid not null references public.story_characters(id) on delete cascade,
  -- 三元組: (陳家明, 以為, 主角死咗) ← 事實 · 唔係 (林思雅, 信任, 主角) 嗰種性格
  subject text not null,
  predicate text not null,
  object text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,                    -- null = 仍然有效
  established_turn integer not null,        -- 邊個回合開始信
  invalidated_by_turn integer,              -- 邊個回合被推翻
  weight real not null default 0.7 check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now()
);

-- 當前有效信念 fast-path (prep 每回合 query · valid_to IS NULL)
create index if not exists char_beliefs_active_idx
  on public.character_beliefs (playthrough_id, character_id)
  where valid_to is null;

-- ============================================================================
-- RLS — user SELECT only · server service-role 寫 (跟 0018 lockdown)
-- ============================================================================
alter table public.character_beliefs enable row level security;

drop policy if exists "char_beliefs_own_select" on public.character_beliefs;
create policy "char_beliefs_own_select" on public.character_beliefs
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );
-- NO user INSERT/UPDATE/DELETE — server service-role bypasses RLS (0018 pattern).
