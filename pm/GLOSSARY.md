# GLOSSARY — Story Engine

> 我哋發明 / 使用嘅術語。新 session Claude 同你都可以 quick reference。
> 加新術語時 sort 字母順序。

---

## 中文 / 業務術語

**故事聖經 (Story Bible)** — 創作時 AI 生成嘅不變骨架，包含核心衝突、世界規則、故事弧、語調。分 Hard Locked / Soft Guided 兩層。每 turn 注入 context（prompt-cached）。

**角色卡 (Character Card)** — 每個 NPC 嘅模板，包含性格、過去、目標、紅線、講嘢風格、發展弧。Story-level（template），唔同 playthrough 共享但 state 獨立。

**紅線 (Red Lines)** — NPC 嘅 hard behavioral limits。觸發即 in-fiction 拒絕。可被 in-game earned exception unlock。

**Earned Exception** — 玩家透過 in-game 行動 (唔係 prompt) 觸發 permanent_flag，解鎖某條紅線變鬆。

**故事自適應介面** — AI 為每個故事生成專屬 JSON Schema + render hints，前端 generic renderer 自動呈現相應 UI（戀愛 → 好感度環，D&D → HP/MP 條）。

**Director（仲裁 AI）** — 每 turn 第一次 LLM call，用 cheap model 預先審核玩家行動，輸出 verdict 俾 Narrator。

**Narrator（敘事 AI）** — 每 turn 第二次 LLM call，用玩家揀嘅 premium model 根據 Director verdict 寫敘事 + state delta。

**Skill Check** — Director 觸發嘅擲骰仲裁。(skill + d20) vs 難度。失敗有真實 state 後果。

**狀態介面 (State Panel)** — 玩家 play 時側邊 panel，render current_state 跟住 state_schema。

**Lorebook** — 自動 / 手動建立嘅 entity 檔案（角色、地點、物品），相關 mentioned 時 always-on injection。

---

## 技術 / 架構術語

**Playthrough** — 一個用戶玩一個 story 嘅獨立 instance。包含 current_state、turn history、character states。同一 story 可有多個 playthrough。

**Story** — 故事 template，包含 prompt seed、state schema、bible、characters、opening。Immutable to non-owners。

**Turn** — 一個 user action + 一個 AI response 嘅 pair。儲存 text + state_delta + LLM metadata。

**state_schema** — JSON Schema 定義 playthrough state 嘅結構。每個 field 有 render_hint。

**state_delta** — JSON Patch (RFC6902) 描述一個 turn 改變咗 state 邊啲 field。

**render_hint** — schema field 上嘅 metadata，告訴前端點 render（bar / progress_ring / inventory_list 等）。9 種 hint enum。

**Credit** — Internal pricing unit。1 credit ≈ $0.001 USD cost。Per-model multiplier 決定 LLM call 扣幾多。

**Credit Ledger** — Append-only 表，記錄每筆 credit 流入流出。Sum(deltas) == current balance（hard invariant）。

**Permanent Flag** — Playthrough 內永久 state marker。Director 用嚟 track earned exceptions / 重大事件。

**Tier** — 訂閱級別（Free / Adventurer / Storyteller / Legend），決定月度 credits + 可用 model + adult mode access。

---

## 業界術語（reference）

**RAG (Retrieval-Augmented Generation)** — 由 vector DB 搵相關過去內容塞入 prompt 嘅技術。我哋 memory layer 3 用。

**pgvector** — Postgres extension 提供 vector column type + similarity search。Supabase 原生支援。

**Prompt Caching** — Claude / OpenAI / Gemini 支援，可 cache system prompt 前綴，重用時 input cost -90%。我哋大量用喺 Bible + Cards。

**Tool Calling / Function Calling** — LLM API feature，AI 可以輸出符合 JSON schema 嘅 structured data。我哋用嚟做 state_delta + Director verdict。

**RLHF (Reinforcement Learning from Human Feedback)** — LLM 訓練階段，令 AI 跟 system prompt 多過 user prompt。係我哋 Layer 1 defense 嘅 foundation。

**Jailbreak** — 用 prompt 技巧令 AI 忽略 system constraints。我哋 3-layer defense 嘅 Layer 2 / 3 對付呢個。

**SFW / NSFW** — Safe / Not Safe For Work。決定 content rating + 可用 model 邊個。

**KYC (Know Your Customer)** — 年齡 / 身份驗證。Stripe Identity 做。

**ADR (Architectural Decision Record)** — 一條 decision 嘅紀錄（context + decision + consequences）。`DECISIONS.md` 嘅格式。
