# BACKLOG — Story Engine

> 唔喺當前 phase 嘅嘢全部 capture 喺度。
> 包括：v1.5+ feature、nice-to-have、暫時 defer 嘅嘢、靈感 idea。
> 唔好直接動工，要做先 promote 入 ROADMAP.md 對應 phase。

---

## v1.5 — 短期 post-launch（launch 後 3 個月內）

### 故事生成增強
- ⬜ **故事封面 AI 生圖**（Fal.ai 或 Replicate）— 自動生 cover，提高 library 觀感
- ⬜ **故事 remix / fork**（不只 play）— 用戶可 fork 別人嘅故事去改，建立衍生作品
- ⬜ **Story import**（由 markdown / Twine / 純文字 import）

### 玩家體驗
- ⬜ **保存重要場景**（"highlight moments"）— 玩家 mark 喜歡嘅 turn，後尾可以 export 成圖文
- ⬜ **多 character 控制**（玩家可同時扮演 2 個角色，e.g., 男女主視角輪流）
- ⬜ **時光倒流**（rewind to turn X）— 付費 feature，扣 credits

### 創作工具
- ⬜ **Lorebook 共享**（一個 lorebook 可 attach 多個 story，e.g., HK 1980s 世界觀重用）
- ⬜ **Character template library**（可發佈 character cards 俾人 import）

---

## Phase 1.5/2 deferred polish（function tier final polish session · defer to later · non-blocking）

呢 4 個係 Phase 1.5/2 audit-deferred polish 嘅大件 item — 需要 cron job / 新 architecture / UI work · 唔係 quick win · defer 落呢度。前 2 條 (NPC fuzzy match + 4-axis init) Session 8 cont. 完成咗。

- ⬜ **P2-UX-H-05 always_on lorebook demote pathway** — 而家 lorebook 加 `always_on=true` 之後永遠喺 retriever 嘅 always_on cap 入面 (capped 至 8, sorted by updated_at)。如果一個 always_on entry 變 irrelevant (e.g., NPC 死咗 / 情節推進)，冇 demote 機制。需要：(a) 一個 cron job (e.g., Vercel cron daily) scan stale always_on entries 計 staleness score (last_referenced + days_old + match_count) · 高 staleness → demote always_on=false (仍然喺 RAG pool 可被 match) · (b) Director 入面加 tool `demote_lorebook` 等 Director 主動 demote。架構唔細 · ~半 session 工作 · Phase 2 audit P2-UX-H-05
- ⬜ **Refusal embed flow** — 當 isLLMRefusal 觸發時 · embed/summarizer/lorebook fire-and-forget 全部 skip · 玩家 action text 都唔 embed。Phase 2 audit 提出嘅 follow-up：refusal 應該 embed user action text 入特定 table (e.g., refusal_log) 等 moderation team review · 或者 separate flag 喺 turn 入面標 refusal 等 future re-train。Scope unclear · pending audit clarification before implementing
- ⬜ **P2-UX-C-03 Memory Journal UI backend prep** — 而家 backend 有 turn_embeddings + memory_summaries + lorebook_entries · 全部 RLS scoped to playthrough。Memory Journal UI (UI tier work) 會展示「AI 記得我講過咩」俾玩家睇。Backend prep needs: (a) `/api/playthroughs/[id]/memory-journal` 新 endpoint return summaries + top lorebook entries · (b) types 統一 export · (c) maybe 加 `last_referenced_at` column to lorebook for "recently used" sorting · 約半 session。但係 UI tier 工作 · defer until UI tier starts
- ⬜ **P2-PERF-C-01 recent turns cache breakpoint reshape** — Anthropic prompt cache 嘅 effectiveness 取決於 recent_turns 邊度 cache break。而家 turn route 將 recent turns 連同 system prompt 一齊 send · cache hit rate ~partial · 可以 reshape — separate system (cacheable static) + history (cacheable up to N turns) + last 2 turns (uncacheable dynamic) · cache hit rate 預期 ~90% · 但 message structure 改要小心 affect prompt engineering · 約 1 session 工作 + audit。Defer

---

## Phase 5 deferred polish（4-cycle audit converged · all non-blocking · 文檔保存防 STATUS rotation）

Wave 2.5 / Wave 2.6 audit findings 確認 non-blocker · defer 落呢度 long-term track。每個 ID 對應 `audit-report-phase5-wave2.5.html` / `audit-report-phase5-wave2.6.html` 詳細 finding。

### Phase 7 content tier — 需要 real data 先決定
- ⬜ **W2.5-GENRE-M-02 alias gap** — variant 詞序 / 新 genre (末日生存 / 宮鬥 / 賽博龐克) / dup-when-rare semantics。Phase 7 收集 5 條官方故事 + 早期 user content 嘅 real genre distribution data 之後再 design 解法（"其他" catch-all board / classify_genre RPC normalize / constrain schema-gen prompt enum）

### UI polish wave 之後修
- ⬜ **W2.5-UX-L-08** Safety hint flicker on slow refreshState post-stream（hasStreamedRef flag）
- ⬜ **W2.5-UX-INFO-09** ACTION_BLOCKED craft hint — post-launch telemetry 收集 trip pattern 之後加「用敘述語氣 vs 第一人稱」嘅 craft guidance
- ⬜ **W2.6-LIB-L-05** 1-char Latin search hint 顯示 wrong copy（gate condition on CJK char only）
- ⬜ **W2.6-LIB-I-06** Settings display_name 仲用 bare `??` · 同 ratings/comments 一致用 `?.trim() ||`
- ⬜ **W2.6-UX-L-03** Turn route English error strings (「unauthorized」「forbidden」etc) leak through fallback · server-side 加 繁中 message field

### Perf sprint 高流量再做
- ⬜ **W2-COST-H-04 / W2.5-CACHE-INFO-10** Library page anon path ISR cache · split anon/authenticated routes 或 use unstable_cache · 高流量 (>100 req/min) 先有 impact

### 技術 debt / defensive hardening
- ⬜ **W2.5-FTS-L-03** Tokenizer 唔 strip combining marks (only zero-width) · moderation 兩者都 strip · defensive consistency
- ⬜ **W2.5-FTS-L-04** Bigram word-boundary mismatch (e.g., '我愛你' vs '我永遠愛你') · long-term consider pg_trgm extension
- ⬜ **W2.5-SQL-L-05** Migration 0012 sanity check 只 verify trending_stories · 唔 check stories_by_genre · parallel check
- ⬜ **W2.5-DB-L-05** INSERT trigger alphabetical ordering 隱含 dependency · 加 explicit doc comment 或 rename
- ⬜ **W2-LIB-L-09** Duplicate stories across multiple carousels · UI tier client-side dedup
- ⬜ **W2-FTS-M-04** Bopomofo (U+3100-U+312F) + CJK Extension B regex extend · TW 注音 title rare case
- ⬜ **W2.6-MIG-L-02** Migration 0014 comment references 'curated' enum value not in CHECK constraint · 1-line doc fix
- ⬜ **W2.6-PLAY-L-03** play-client fallback msg renders "[object Object]" if body.error/message is non-string · typeof guard
- ⬜ **W2.6-PLAY-L-04** action_blocked branch swallows empty-string message · drop && body?.message gate
- ⬜ **W2.6-MIG-I-07** createStory action + INSERT trigger both set origin='user' · Phase 7 service-role path 之後可以 drop action-side
- ⬜ **W2.6-MIGRATION-L-04** Migration sanity check 用 fragile string match · pattern note for future migrations
- ⬜ **W2.6-INFO-03** getCommentReplies 仲未 UI-wired · 加 TODO comment near export · 將來 reply UI 用 display_name?.trim() pattern

---

## v1.5+ — 待 revisit decisions

### 外面 writer / Author program 嘅版權安排
- **Status**: Deferred from OPEN_QUESTIONS Q7 — 用戶「將來嘅嘢將來再算啦做好個產品先」
- **Context**: ADR-011 lock 咗 launch 時官方故事由 founder + Claude 自己寫。但 v1.5+ 開放 author program 之前要 decide:
  - A. 平台擁有 writer 嘅故事全部版權
  - B. Writer 保留版權，平台獨家展示授權（industry standard，attract talent）
  - C. Case-by-case hybrid
- **Action when reaching v1.5 author program scope**: 請律師起 contract template + business decide A/B/C

---

## v2 — 中期（launch 後 6-12 個月）

### Multi-player
- ⬜ **Co-op 雙人遊玩**（兩個玩家輪流出招，扮演同個或唔同角色）
- ⬜ **GM 模式**（一個玩家做 narrator，AI 扮演 NPC）
- ⬜ **Spectator mode**（公開直播 playthrough）

### Voice / 多模態
- ⬜ **TTS 敘事**（中文 TTS，e.g., ElevenLabs 中文 voice）
- ⬜ **語音輸入**（Whisper 廣東話 / 普通話）
- ⬜ **NPC voice**（每個 NPC 有獨立 voice profile）
- ⬜ **Scene image gen**（重要 scene auto 生圖）

### 創作 ecosystem
- ⬜ **Branching narrative designer**（俾專業作者用嘅 tree editor，做 premium 官方故事）
- ⬜ **Author monetization**（用戶收費故事，平台抽成）
- ⬜ **Translation feature**（一鍵繁中 → 簡中 / 英文）

---

## v3 — 長期

- ⬜ **Mobile native app**（iOS + Android，先 PWA 驗證需求）
- ⬜ **多語言擴展**（簡中 → 英 → 日 → 韓）
- ⬜ **企業 / 教育 license**（學校用嚟做 interactive learning）
- ⬜ **AR/VR 整合**（戴 headset 玩文字 RPG，瘋狂諗）

---

## 💡 Ideas / 未評估

呢度放未決定要唔要做嘅嘢，傾過先 promote。

- 💡 **DLC 機制** — 官方為 hit 故事出「續集」「番外篇」DLC（一次性購買）
- 💡 **Creator program** — 邀請 HK / TW influencer 做官方故事
- 💡 **故事評論系統升級** — 唔只 5 星，加「emotional tag」（驚喜 / 心酸 / 緊張）
- 💡 **AI 自動 generate trailer** — 用故事內容自動生 30 秒 trailer 圖文
- 💡 **多 model ensemble** — 同一 turn 兩個 model 各寫一段，玩家揀
- 💡 **跨故事 character cameo** — 你之前故事嘅 character 可以 guest 喺新故事

---

## ⏸️ 暫時 defer（諗過但唔做）

- 暫時 defer：自建 LLM hosting（vLLM / Ollama）— 成本同維護唔抵
- 暫時 defer：blockchain / NFT 故事所有權 — 中文圈用戶冇 demand
- 暫時 defer：英文 market 進入 — 等中文圈 PMF 先
