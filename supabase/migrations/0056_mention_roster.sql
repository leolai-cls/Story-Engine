-- 即興名冊 (Mention Roster · 角色升級階梯第 0 層 · pm/architecture/03)
--
-- 防 retcon：AI 一提到某個名 (連 walk-on 路人) 就記低 {name, turn}。下回合將成個
-- 名冊餵返 Narrator (內部 context · 唔俾玩家睇)，等就算弱 model 都有 grounding —
-- 唔會改個名、唔會當佢哋無出現過。真實 bug：turn 2 寫「阿俊」· turn 4 否認改「阿輝」。
--
-- 升級階梯：即興名冊(0) → lorebook(1·有描述+embedding) → 完整靈魂(2·經歷+沉澱)。
-- 主要角色 (story_characters) 唔入冊 (佢哋已喺 Narrator character context)。
-- 今回合新名由 turn route 重用既有 Haiku extractTurnState call 抽 (只攞名 · 唔加 LLM call)。

alter table public.playthroughs
  add column if not exists mention_roster jsonb not null default '[]'::jsonb;

comment on column public.playthroughs.mention_roster is
  '即興名冊 (Character Soul · 角色升級階梯第 0 層)。[{name, turn}] 陣列 · 曾經喺敘事提過名嘅 walk-on 路人 · 防 retcon (改名/否認存在)。主要角色 (story_characters) 唔入冊。由 turn route extractTurnState 抽名 + mergeMentionRoster 累積。capped 40。';
