-- 0049 · 角色沉澱張力 (Character Soul M2 · pm/architecture/03)
--
-- 2026-06-01: 角色唔係即時反應 · 經歷累積夠先演化 (沉澱消化機制)。
--
-- 用獨立 column (唔放 dynamic_state) 避免同 apply_npc_dynamic_state RPC (0024)
-- 嘅 read-modify-write race — 兩個 after() block 都改 dynamic_state 會撞。
-- pending_tensions 自己一個 column · 各寫各 · 無 race。
--
-- 形狀 (jsonb)：
--   {
--     "tensions": [ { "axis": "對主角嘅信任", "accumulated": 0.9, "last_turn": 23 } ],
--     "sediments": [ { "axis": "對主角嘅信任", "turn": 24, "note": "由戒備轉為信任" } ]
--   }
-- tensions = 未沉澱嘅累積張力 (per axis)。超 threshold → 轉成一個 sediment (已消化嘅演化)
-- + 該 axis 嘅 accumulated reset。sediments 餵俾 Narrator 表示「角色啱啱消化咗一個轉變」。

alter table public.playthrough_character_states
  add column if not exists pending_tensions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(pending_tensions) = 'object');

comment on column public.playthrough_character_states.pending_tensions is
  '沉澱張力 (Character Soul M2)。{tensions:[{axis,accumulated,last_turn}], sediments:[{axis,turn,note}]}。經歷累積超 threshold (由角色 volatility 計) 先由 tension 轉 sediment (演化)。';

-- 角色易變度 (volatility 0-1)：固執→低 (難變)·情緒化→高 (易變)。
-- 故事建立時 AI 理想生成 (M2 待 schema-generator 更新)·暫時 fallback 0.5。
-- 放 story_characters (模板級·per-story 一致)。
alter table public.story_characters
  add column if not exists volatility real not null default 0.5
  check (volatility >= 0 and volatility <= 1);

comment on column public.story_characters.volatility is
  '角色易變度 0-1 (Character Soul M2)。沉澱 threshold = 1.5 - volatility。固執角色低 (難變)·情緒化高 (易變)。暫 fallback 0.5·待 schema-generator 按性格生成。';
