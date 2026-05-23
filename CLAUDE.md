# Story Engine — Project Soul

> 呢份係 project 嘅 soul file，每次 Claude 喺呢個 directory 開session 都會自動 load。
> 用嚟記住核心願景、合作風格、關鍵決定。Conversation 被 compact 都唔會丟失。

---

## 一句話定位

**中文圈嘅互動式故事 RPG 平台 — 每個人都可以走入自己嘅故事，做主角。**

---

## 同呢位用戶合作嘅風格

用戶 = **創意 + 商業 partner**，**冇 technical background**。Claude 對佢嘅角色係 **vibe coding 拍檔** + technical translator + 執行者。

**永遠遵守**：

- ✅ **用繁體中文** 溝通（用戶會中英夾雜，你跟住嚟）
- ✅ 當佢係 **business partner**，唔係 engineer。傾 product / 體驗 / 商業模式，唔好開口就 stack trace
- ✅ 解釋決定時用 **business language + 具體例子**（戀愛故事介面 vs D&D 介面），唔好淨係列 framework
- ✅ Solo dev 但 **唔妥協 scope** — 唔好因為佢一個人就建議減 feature。佢 willing to put in the work，分階段執行就得
- ✅ 行動前 **講清楚會做咩**，做完 **summary 1-2 句**
- ✅ 風險決定（destructive ops、share data、charge money）**永遠 confirm 先做**
- ✅ **任何要用戶 review 嘅 artifact 一律輸出 HTML**（MD 太難讀）。MD 留俾 AI / git diff 用。User-facing review = HTML always.
- ✅ HTML 要 **設計過、scannable、繁中**。同 `plan.html` / `pm-dashboard.html` 一致 design system

**唔好做**：

- ❌ 用 jargon 唔解釋（"pgvector embeddings via cosine similarity" → 直接講「AI 識搵返過去相關情節」）
- ❌ 一次 dump 一大堆 code 然後問「ok 啦？」— 一個 phase 一個 phase 嚟
- ❌ 為咗 "ship faster" 自動 cut scope。要 cut 先問用戶
- ❌ 用 emoji 喺 code / file 入面（除非用戶要）
- ❌ 俾用戶睇 raw markdown 做 review — 一律 render 做 HTML 先呈現

---

## 核心產品決定（已 lock）

| 決定點 | 揀咗咩 | 點解 |
|---|---|---|
| **MVP scope** | 一個 engine handle 三個 mode（自己創作 / 社群 / 官方） | 三者本質係同一件事 — 邊個寫個 prompt 而已 |
| **市場** | 中文圈 first（HK + TW + 海外華人，繁中為主） | 大平台冇人服務，藍海 |
| **遊玩模式** | 故事自適應介面（AI 每個故事生成專屬 state schema + 對應 UI） | 護城河 feature，其他平台抄起碼要 6-12 個月 |
| **多 Model** | 用戶可揀 Claude / GPT / Gemini / Grok / Open Source | 唔同用戶有唔同偏好，credits 一視同仁 |
| **付費模式** | Subscription + 月度 credits + 一次性 top-up | 對齊 NovelAI / AI Dungeon，平台用戶熟 |
| **成人模式** | Opt-in + KYC 年齡驗證；開啟後只可用唔會 ban 嘅 Model | 防止大 Model 公司 ban 我哋個 account |
| **長期記憶** | 4 層架構：近 20 turns 全文 + 滾動摘要 + RAG 向量 + 自動 lorebook | 解決行業 #1 churn 原因（"AI 唔記得"） |
| **Narrative Integrity** | Story Bible + Character Cards + Skill Checks + Director Model | 解決行業 #2 churn 原因（"取悅型 AI / Yes-Man Problem"） |
| **訂價** | USD 為 primary（$9.99 / $19.99 / $49.99） | HK / TW 用戶熟，唔需要 multi-currency 複雜 |
| **Launch market** | HK + TW 同步 launch | 用戶 explicit 決定。TW 市場大過 HK 4x，同步加速 PMF。**官方故事要 cultural diversity** — 唔可以全 HK setting |
| **官方故事創作** | Founder + Claude 自己寫（at launch） | Solo lean，align founder vision，author program 推遲到 v1.5+ |
| **違規過濾 provider** | OpenAI Moderation API (free) at launch | Free + cover 大部分 case；Phase 5 review |
| **AI 記性引擎** | OpenAI text-embedding-3-small | 多語言 + 平；Phase 2 用中文 benchmark 驗證 |
| **Turn pipeline 架構** | **Orchestrator Pattern**（用戶 intuition lock 嘅）| 玩家輸入永遠先經後台框架 enforcement + 記憶 prep + Director 仲裁，先 call 外部 LLM。玩家 prompt 冇辦法直接觸碰外部 LLM |

## Narrative Integrity Engine（產品護城河 #2）

行業最大 design flaw：AI 不斷取悅玩家，NPC 冇靈魂，玩家想做乜就做乜。我哋用 4 層解決：

**① 故事聖經 (Story Bible)** — 創作時 AI 生成 + 用戶可改，永遠注入 context（Anthropic prompt cache）：
- 核心衝突 (central_conflict)
- 世界規則 (world_invariants) — 物理 / 魔法 / 社會 hard limits
- 故事弧 (story_arc) — 3-5 個 Act milestones
- 語調風格 (tone_and_style)

**② 角色卡 (Character Cards)** — 每個 NPC 一張，包括：
- 性格 traits、過去、目標
- **紅線 (red_lines)** — 觸發即 in-fiction 拒絕，AI 永遠唔可以違反
- 講嘢風格 (voice_sample)
- 弧線（NPC 點evolve）

DB：`story_characters` (模板) + `playthrough_character_states` (per-playthrough 狀態 / disposition / 累積記憶)

**③ 能力檢定 (Skill Checks)** — 玩家試風險行動時觸發：
- (skill stat + d20) vs Director 定嘅難度
- 失敗 = 真實 state cost（HP / 好感度 / 信任 / 聲譽）
- **永久後果，唔可以 reset 同一 turn**
- UI：擲骰動畫提升 RPG 感

**④ Director Model** — 每 turn 第 1 次 LLM call：
- 用 cheap model（Haiku / Gemini Flash），1-2 秒
- 檢查：violate Bible？違反 NPC 紅線？需 Skill Check？Arc 走偏？
- 輸出 structured verdict → Narrator 根據 verdict 寫敘事
- **+20-30% credits/turn**，但係 Narrator 仲係用玩家揀嘅 premium model

**UX hard rule**：Director 嘅介入永遠 in-fiction（NPC pushback / failed attempt），唔係 system error message。「林思雅推開你」唔係「Action rejected: personality violation」。

### Bible 3 層 calibration（防止過度寫死）

| 層 | 字數預算 | 例子 | 點 enforce |
|---|---|---|---|
| 🔒 Hard Locked | 150-300 字 (5-10 條) | premise、NPC 紅線、世界物理 limits | System prompt + Director 強制 |
| 🎯 Soft Guided | 300-500 字 | Story arc with **conditional** transitions | Director 引導但有彈性 |
| 🎨 Open | 0 字 | 對白、場景、subplot、NPC 反應細節 | 唔寫，Narrator 自由發揮 |

**Hard rules**：
- Story arc transition **永遠用 condition**（「好感度 >= 60 且 1-on-1 互動 >= 3」），**永遠唔用 turn number**（「第 12 turn」）
- Hard Locked 層由 Director 強制；Soft Guided 層 Director 有 discretion
- **Earned exception**：玩家可以透過 in-game 行動「改變」NPC red lines（e.g., 救咗佢一命解鎖某啲信任）。Director 判定可否觸發

### 3 層防禦：點樣 enforce Bible

| 層 | 機制 | 防咩 |
|---|---|---|
| 1. System prompt priority | Bible / 紅線寫入 system role，LLM RLHF 訓練成 system 優先於 user | 95%+ 普通玩家 prompt |
| 2. Director Model | 第二個 LLM call 預先審核玩家行動 | 老練玩家 jailbreak |
| 3. Tool Calling structured output | state_delta 必須符合 JSON Schema | AI hallucinate 或被 prompt 騙 |

加埋 **Anthropic / OpenAI prompt caching**：Bible + Character Cards 嘅 system prompt 前綴 cached → input cost -90% → Bible / Cards 可以寫得 detailed 而 cost 唔爆炸。

**Phase placement**：階段 1 包含 Bible + Character Cards generation；階段 1.5 加入 Director + Skill Check engine。**MVP day 1 hard requirement** — 第一個玩家試覺得 yes-man，我哋就輸咗。

---

## 技術選擇（已 lock）

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js 15 (App Router) + TypeScript + React 19 |
| UI | Tailwind v4 + shadcn/ui + Framer Motion |
| Database / Auth | Supabase（Postgres + pgvector + Auth + Storage + Realtime + Edge Functions） |
| LLM 抽象層 | Vercel AI SDK |
| Embedding | OpenAI text-embedding-3-small (1536-dim, 中文友好) |
| Payments | Stripe Subscriptions + Checkout |
| 年齡驗證 | Stripe Identity |
| Email | Resend |
| Analytics / Errors | PostHog + Sentry |
| Hosting | Vercel + Supabase |
| i18n | next-intl，繁中 default，簡中 + EN day-1 ready |

---

## 開發路線圖（high-level）

```
階段 0 — 地基（auth, layout, design system）
階段 1 — 故事引擎 MVP（創作 + 遊玩 + 自適應介面） ← 核心
階段 2 — 長期記憶系統（4 層架構）
階段 3 — 多 Model + Credits
階段 4 — 訂閱付費（Stripe）
階段 5 — 社群（Library + 評分 + 評論）
階段 6 — 成人模式（KYC + OpenRouter）
階段 7 — 上線打磨（5 條官方故事 + 新手引導 + 優化）
```

每階段完成 → 行完整 verify flow → 至 move on。

---

## 文檔指引

**進嚟新 conversation 必讀順序**：
1. 呢份 `CLAUDE.md`（auto-loaded） — 知道 user / project / hard rules
2. `pm/STATUS.md` — 知道而家喺邊度、focus 咩、有冇 blocker
3. `pm/OPEN_QUESTIONS.md` — 知道仲有咩待 decide

**檔案結構（兩層：HTML 俾人睇、MD 俾 AI / git）**：

| Human-facing (HTML) | Machine-facing (MD) | 用途 |
|---|---|---|
| `plan.html` | `~/.claude/plans/text-based-rpg-webapp-elegant-kurzweil.md` | 完整 plan — HTML 業務 view，MD 技術深度 |
| `pm-dashboard.html` | `pm/STATUS.md` + `pm/ROADMAP.md` + `pm/DECISIONS.md` + `pm/BACKLOG.md` + `pm/OPEN_QUESTIONS.md` + `pm/GLOSSARY.md` | PM dashboard — HTML 一覽，MD 分文件 source of truth |
| — | `CLAUDE.md`（呢份） | Project soul，每次自動 load |

**Update 紀律**：
- Source of truth = MD（version-controlled，AI 易讀）
- HTML = generated view，當 MD 重大改動時 regenerate
- 任何 product decision lock → 寫 ADR 入 `pm/DECISIONS.md` + 更新 `CLAUDE.md` 對應 section + 同步刷新 `pm-dashboard.html`
- 任何「以後做」嘅 idea → 寫入 `pm/BACKLOG.md`
- 任何 ambiguous「應該 X 定 Y」→ 寫入 `pm/OPEN_QUESTIONS.md`
- Session 結束 → 更新 `pm/STATUS.md` session log + 刷新 `pm-dashboard.html#status`
- 用戶要 review → 永遠 render HTML，唔好俾佢睇 raw MD

**Update 紀律**：
- 任何 product decision lock → 寫 ADR 入 `DECISIONS.md` + 更新 `CLAUDE.md` 對應 section
- 任何「以後做」嘅 idea → 寫入 `BACKLOG.md`，唔好淨係口頭講
- 任何 ambiguous「應該 X 定 Y」→ 寫入 `OPEN_QUESTIONS.md`
- Session 結束 → 更新 `STATUS.md` session log

**Phase 0 開始 code 之後 migration plan**: 起 GitHub repo，將 `pm/ROADMAP.md` 嘅 checkbox migrate 成 GitHub Issues + Projects board。STATUS / DECISIONS 仍然留喺 repo markdown。

---

## 重要提醒（俾未來嘅 Claude）

1. **用戶係 vibe coder** — 佢可能會問「點解你要咁寫」。耐心解，唔好覺得佢應該知。
2. **唔好 over-engineer** — solo dev，最少 moving parts。Supabase 揀咗就唔好諗 self-host Postgres。
3. **每個 phase 完成 = 一個可以 demo 嘅完整功能塊** — 唔好 leave half-done features。
4. **Credits 計算邏輯要絕對啱** — 用戶會 trust 你 credit balance。任何 off-by-one 等於信任崩塌。Ledger append-only，永遠唔好 mutate balance 而唔寫 ledger entry。
5. **成人模式嘅 LLM 隔離係 hard rule** — 唔好為咗方便就喺 Claude API 上面跑 NSFW 流量。整個平台會 ban。
6. **無論咩模式都要 CSAM / 違法內容 pre-filter** — 法律底線，唔可以 bypass。
7. **Audit-before-next-phase 紀律** — 每個 phase 完成後做一次 deep audit (HTML report)，先入下一 phase。Pattern proven 救命：Session 4 嘅 C-01 Arc DSL bug 喺 audit catch 到，玩家無感知就修好。**ship → audit → fix critical → next phase**。
8. **Path-format drift 係 recurring bug class** — 凡係 prompt 教 LLM 寫某格式、parser 認某格式，兩邊 spec 一定要同步。Mitigation：parser 接受多種合理 format + log undefined-path warnings 做 future drift visibility。Examples 寫 prompt 入面要 strict match parser 嘅 expected paths。
9. **用戶 instinct 永遠值得 push back** — Session 3 嘅「秒速彈 error 唔似真 LLM 處理」push back 直接 catch 到 SDK baseURL bug。佢 vibe coder 但 product sense 好強，唔好為咗 efficiency 跳過佢嘅 doubt。
10. **Anthropic structured output 有 2 個 limits**：(a) ≤24 optional params per schema (b) compiled grammar size ceiling。Both must be respected。解法：split 成 parallel sub-calls，每個 schema 簡單到唔爆 grammar ceiling。
11. **5-agent parallel dimension audit > sequential** — Session 5 用 Security · AI Pipeline · State+Render · DB · UX 五個 dimension agent 同時跑 → 95 finding 浮現，包括 3 個 silent corruption pattern 跨多個 dimension。Cross-dimension 對應指向 root cause。Cost 細，visibility 大。
12. **Resilient deploy pattern**：當 code 需要 prod migration 時，try/catch RPC call → fallback to legacy path。Deploy 同 migration timing 解耦，唔需要嚴格 sequencing。Logs warning 但唔 break prod。Wave 5 用咗呢個 pattern shipped 兩個 atomic RPC 即時 deploy 安全。
13. **Prompt cache fragile to dynamic data** — Anthropic ephemeral cache key = byte equality on prefix。一 byte 變 → cache miss。Static template (永遠唔變) 同 dynamic state (每 turn 變) 必須分開。Wave 6 拆 characterCardStaticTemplate / characterDynamicState → estimated cache hit 由 ~0% 升 >90% (~10x cost save)。
14. **`"use server"` 喺 library file 係 attack vector** — Next.js Server Action 暴露 directive 到客戶端。喺 lib/ 嘅 file 唔需要做 Server Action 就唔好寫 `"use server"`。Wave 2 嘅 schema-generator.ts 就係呢個 footgun — 任何 unauth visitor 可以直接 POST 燒 $0.20/call。
15. **All write policies need `with check`** — Postgres RLS `using` 只 filter SELECT/UPDATE/DELETE 嘅可見性，`with check` 先 validate INSERT 同 post-UPDATE state。冇 `with check` 等於用戶可以 INSERT 帶其他人 owner_id。Hard rule。
16. **Zod parse at DB boundary, never cast** — `as StateSchema` cast 唔 runtime check，corrupt jsonb 會深層 crash。永遠用 `XxxSchema.safeParse(...)` at boundary，friendly error 比 stack trace 好。
17. **`void (async () => ...)` 喺 Vercel serverless 係 silent killer** — Lambda terminate response stream 一 close 即斬纜 in-flight promise。Background work (embed / summarizer / lorebook / log write / webhook) 必須用 <code>after()</code> from `next/server` 或 Vercel 嘅 <code>waitUntil</code> from `@vercel/functions` wrap，先 keep lambda alive past response。Session 6 Phase 2 SHOWSTOPPER 就係呢個 — Phase 2 tier 2/3/4 喺 prod 默默死晒，audit 至 catch 到。
18. **Top-K retrieval 冇 similarity floor 等於 noise by design** — `ORDER BY similarity LIMIT K` 一定返 K row 唔理多 irrelevant。Player 經驗 "AI 老係 reference 過場 NPC" 唔係 bug，係 by-design 行為。Vector search 永遠加 `WHERE similarity > threshold` floor — 回 EMPTY 好過回 noise。每個 source tune 唔同 floor (Story Engine: summaries 0.55 / RAG 0.5 / lorebook 0.45)。
19. **Memory / 後台 feature differentiator 一定要 UI surface** — 即使 backend 100% work，user 見唔到就 unfalsifiable。NovelAI lorebook UI 係佢哋 #1 retention driver。"AI 真係記得" claim 冇 Memory Journal 等於 marketing 喺空氣度。Plan UI 同 backend 一齊 ship，唔係留到「之後」。
20. **Audit cost projections 永遠 underestimate** — Phase 2 原本估 ~2% memory overhead，實際係 ~35% on Narrator baseline。每次 add LLM call 都要 re-baseline 真實 per-turn cost vs subscription tier pricing。Adventurer $9.99/mo 200-turn = $4.60 = 46% COGS。
21. **Founder priority rule — Function → UI → Money** — Phase number 唔等於 execution order。Founder explicit 講：先完成所有 product **function**（story engine / memory / community / adult mode logic / official content），再 **UI** design（library / Memory Journal / locale switcher / Settings polish / Library UI），最後先做 **money**（credits UX / Stripe / KYC / refund saga）。Session 7 嗰陣 Phase 3 credits 順序排錯 — 屬於 money tier 但做咗喺 function 完成之前。**任何時候建議 next move 之前 check：佢屬邊個 tier？高 tier 嘅 deferred work 唔該先做晒**。
22. **加 enum 但唔 implement filter = documented missing safeguard** — Phase 5 嘅 `moderation_flags` 加咗 `'csam'` 同 `'sexual_minor'` enum 表示呢類 vector 存在，但 createStoryFromPrompt / upsertComment / rateStory 全部冇 pre-filter。CLAUDE.md hard rule #6 violation。**每次加 enum 認 acknowledge attack vector 嘅同時必須 implement 對應 defense**。否則就係 schema-level admission without code-level enforcement。
23. **`bump_X_count` triggers need symmetric INSERT + DELETE handlers** — counter-without-decrement 係常見 race vector。Phase 5 嘅 play_count 只有 INSERT trigger，加 user 可以 fork→delete loop 將 count inflate。每次寫 trigger 增 counter 都諗：「邊個情況會減？」如果有 DELETE 路徑能 affect count，就需要 mirror trigger。
24. **`auth.uid() = user_id` UPDATE policy 唔夠 — 要 column restriction** — Phase 5 嘅 story_comments_own_update 用 bare `using/with check auth.uid()=user_id` — 但冇限制邊個 column 可以改。用戶可以 un-delete · edit body · re-parent 跨 story · 改 story_id。**任何 UPDATE policy 都要諗：用戶可以改邊個 column？哪個 column 變化會 break invariant？** 解法：trigger BEFORE UPDATE 比 RLS column-list 更穩。
25. **Postgres FTS `'simple'` config 對 CJK 完全壞** — 用 whitespace tokenize，中文冇 whitespace → 整 title / paragraph 變一個 token。`'校園戀愛'` query 唔會 match `'TW 大學校園戀愛故事'` title。Story Engine launch market 係 HK + TW，呢個影響 #1 query pattern。每次 add FTS to Chinese-market product 必須 verify tokenization works。MVP path：trigger 入面 manual bigram tokenize CJK chars；或者用 pg_trgm extension。
26. **Trending formulas with `ln(plays + 1)` give 0 for new content** — cold-start blocker。`ln(0+1) = 0` → 新 story trending_score = 0 → 永遠唔上榜 → 永遠冇 plays → 永遠 0。Phase 5 嘅 trending 公式發生呢個 bug。解法：加 newcomer boost term `+ exp(-age_days/3)` 比 3-day 半衰期 OR union 一個 "freshly published" carousel WHERE play_count < N ORDER BY created_at desc。任何 trending / discovery 公式都要 think about cold-start path。
27. **Time-decay formulas need `greatest(0, now() - t)` clamp** — Phase 5 Wave 2 嘅 trending newcomer boost `exp(-age_days/3)` 冇 clamp · 加上 stories INSERT RLS 冇 column-list restriction · 用戶 browser console INSERT 設 created_at='2099-01-01' → exponent 變 positive → exp 爆炸到 e^120 → 永久霸佔 trending。**任何 exp / log time-decay 公式都要 clamp time delta 做 non-negative**。獨立於 INSERT-side 嘅 column lock 一齊 ship 做 defense-in-depth。
28. **Schema-generator output ≠ developer enum convention** — Phase 5 Wave 2 嘅 library page 用英文 GENRE_BOARDS key ('romance', 'adventure')，但 schema-generator prompt 教 Claude 出 CJK genre ('戀愛校園', '古惑仔', '玄幻冒險')。Two-sided contract 唔 reconcile → 6 個 carousel 永久空白 · multi-board UX dead-on-arrival。**任何 LLM-generated identifier / enum 經過 developer code 嘅 join / filter / equality compare，必須 cross-reference prompt examples 同 code constants**。Solution patterns: (a) controlled enum at LLM output side (Anthropic structured output enum field) · (b) alias arrays at consumer side · (c) post-process normalize to controlled vocabulary at storage time。
29. **3-cycle audit pattern converges to 0 ship blocker** — Phase 5 community proved「ship → audit → fix critical → ship → audit → fix critical → ship → audit converged」係 reliable pattern。Wave 1 audit 揾 6 ship blocker · Wave 2 audit 揾 5 · Wave 2.5 audit 揾 0。**每個 phase function 完成後 plan minimum 2-3 個 audit cycles · 唔好 ship → next phase 跳格**。CLAUDE.md hard rule #7 「audit-before-next-phase」喺 Phase 5 救咗 11 launch-day-killing issue 唔上 prod。每次 audit cycle 用 2 parallel agent (Security/Correctness + UX/Cost/Regression) — 5-agent 太重 only suit foundation-level audit。
30. **Empty-string URL params vs nullish coalescing** — Phase 5 Wave 2 嘅 library search form `<select value="">` default 加 `params.language ?? null` 唔 catch empty string · RPC `where s.language = ''` → 0 results everywhere · user 按一次「搜尋」即 library 表面壞晒。**`??` 只 catch null / undefined，empty string passes through**。Form input + RPC filter pattern 兩邊都要 reconcile：UI sanitize `sp.x?.trim() || undefined` · OR RPC layer treat empty as "no filter"。任何 URL searchParams 落 RPC 都 check 呢個 path。
31. **Fetch response single-consume gotcha in error handlers** — Phase 5 Wave 2.5 audit 揾到 play-client 嘅 400/403/503 inner handlers 各自 `await res.json()` · fall-through 到底嘅 `await res.text()` 會 throw "body stream already read"。**Fetch Response 嘅 body 只能 consume 一次**。Pattern: 讀 body 一次 at top of `if (!res.ok)` · 之後 key off body?.error per status。Drop 底嘅 fallback `res.text()`。

---

## Open Items（待解決）

- 內容 moderation 嘅具體實作（哪個 provider、CSAM filter source）
- 預設訂價係 USD 定 HKD？最終 launch 時 confirm
- v1.5 嘅 cover image 生成用邊個 provider（Fal.ai vs Replicate vs Together）
- Lorebook entity 同名 dedup 策略（「阿明」vs「陳家明」）— 用 naive exact match 先
- Phase 1.5.3 M-02 NPC name fuzzy match strategy（exact + Levenshtein fallback?）

---

_Last updated: 2026-05-22 (Session 8 — Phase 5 Community ship + 4-cycle audit · Wave 2.6 audit converged again at 0 ship blocker · 21 issues caught & fixed pre-prod · Wave 2.7 micro-patch + Manual E2E pending)_
