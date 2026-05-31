-- 0047 · turns.failed 標記（ADR-001 原則 5 · 技術失敗要誠實）
--
-- 2026-06-01: Narrator 技術失敗（超時 / 交白卷 / model 出錯）時，唔再貼假故事
-- 文字（舊「眉頭微皺」fallback），亦唔用暗號文字 sentinel。改用一個正式 boolean
-- 標記 `failed`。前端見到 failed=true → 顯示「整唔到請再試」+ retry 掣（似 ChatGPT），
-- 唔當故事內容。失敗回合唔 embed 入記憶。
--
-- 將來 pm/architecture/07 清潔系統可以一句 SQL 揾晒失敗回合清走：
--   DELETE FROM turns WHERE failed = true AND created_at < now() - interval '1 day';
--
-- 現有所有回合預設 failed=false · 唔影響任何嘢。

alter table public.turns
  add column if not exists failed boolean not null default false;

-- 局部 index：只 index failed=true 嘅 row（極少數）· 俾清潔系統快速掃描。
create index if not exists idx_turns_failed
  on public.turns (playthrough_id)
  where failed = true;

comment on column public.turns.failed is
  '技術失敗回合標記（Narrator 超時/空白/出錯）。前端顯示 retry · 唔當故事 · 清潔系統清走。ADR-001 原則 5。';
