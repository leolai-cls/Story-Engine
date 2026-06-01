# Kieio (Story Engine) — Project Soul

> 呢份係 project 嘅 soul file，每次 Claude 喺呢個 directory 開session 都會自動 load。
> 用嚟記住核心願景、合作風格、關鍵決定。Conversation 被 compact 都唔會丟失。

**Product brand (locked 2026-05-26)**: **Kieio** · 讀「KEE-yo」(2 syllables) · domain **kieio.com** (Cloudflare registrar · Vercel hosted · DNS auto-configured via Vercel Domain Connect)
**Internal codename**: Story Engine (continue 用喺 internal docs / git history / repo name)

---

## 一句話定位

**Kieio · 中文圈嘅互動式故事 RPG 平台 — 每個人都可以走入自己嘅故事，做主角。**

---

## 同呢位用戶合作嘅風格

用戶 = **創意 + 商業 partner**，**冇 technical background**。Claude 對佢嘅角色係 **vibe coding 拍檔** + technical translator + 執行者。

**永遠遵守**：

- 🔴 **同用戶講嘢一定要用繁體中文，而且零英文技術 terms**（用戶講過 100+ 次，呢個係最重要嘅 rule）。唔好寫 CRIT/HIGH/MED、唔好寫 framework 名、唔好寫 component/schema/endpoint 呢類字、表格 header 唔好用英文。要用就即場用日常話解釋（例：唔好寫「SSE stream」→ 寫「即時送返嚟嘅文字」）。內部文件 / git / code comment 可以中英夾雜，但**面對用戶講嘢就要乾淨繁中**。
- ✅ 當佢係 **生意拍檔**，唔係工程師。傾產品 / 體驗 / 商業模式，唔好開口就講技術細節
- ✅ 解釋決定時用 **生意角度 + 具體例子**（戀愛故事介面 vs D&D 介面），唔好淨係列一堆名詞
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
| **遊玩模式** | 故事自適應介面（AI 每個故事生成專屬 state schema + 對應 UI） | 護城河 feature — 數據 + 介面都跟故事生成 |
| **多 Model** | 用戶可揀 model（**2 tier：Standard / Pro**，見下） | 唔同用戶有唔同偏好，credits 一視同仁 |
| **付費模式** | Subscription + 月度 credits + 一次性 top-up | 對齊 NovelAI / AI Dungeon，平台用戶熟 |
| **訂閱層** | **2 tier：Standard（平 model）+ Pro（強 model）**；成人模式 = Pro 入面嘅 toggle | 簡化（前身有 Pro Max / Adult tier 已砍） |
| **成人模式** | Opt-in + **自我聲明 18+ checkbox（NO KYC — 已 cancel 好耐）**；開啟後只可用唔會 ban 嘅 model | KYC 太重 · 自我聲明足夠 |
| **長期記憶** | 4 層架構：近 20 turns 全文 + 滾動摘要 + RAG 向量 + 自動 lorebook + **角色記憶宮殿 + 信念演化** | 解決行業 #1 churn 原因（"AI 唔記得"）· 詳見 `pm/architecture/04-memory.md` |
| **角色靈魂 + GM** | **角色三層靈魂（出身+經歷+沉澱）+ GM 做 prep 員（唔做決策）+ 四層優先級** | 解決行業 #2 churn（"yes-man / NPC 冇靈魂"）· **2026-06-01 重設計取代咗舊 Director Model**，詳見 `pm/architecture/` |
| **訂價** | USD 為 primary（Standard / Pro 兩個價位） | HK / TW 用戶熟，唔需要 multi-currency 複雜 |
| **Launch market** | HK + TW 同步 launch | 用戶 explicit 決定。TW 市場大過 HK 4x，同步加速 PMF。**官方故事要 cultural diversity** — 唔可以全 HK setting |
| **官方故事創作** | Founder + Claude 自己寫（at launch） | Solo lean，align founder vision，author program 推遲到 v1.5+ |
| **違規過濾 provider** | OpenAI Moderation API (free) at launch | Free + cover 大部分 case；Phase 5 review |
| **AI 記性引擎** | **CrazyRouter text-embedding-3-small**（HK founder 攞唔到 OpenAI key） | 多語言 + 平；經 CrazyRouter 路由 |
| **Turn pipeline 架構** | **四層優先級 + 單 Narrator LLM**（GM 做 prep 員，唔做決策）| 玩家輸入經 GM 整理（世界>角色>場景>玩家指令）後交俾 Narrator 自然敘事。**2026-06-01 取代咗舊 Orchestrator/Director 仲裁架構**，詳見 `pm/architecture/02-turn-pipeline.md` |

## 角色靈魂 + 記憶引擎（產品護城河 #2 — 2026-06-01 重設計）

> 🚨 **完整架構喺 `pm/architecture/` folder**。呢度只係 high-level summary。
> **新 session 處理角色 / 記憶 / GM / turn 相關嘢之前，一定要先讀 `pm/architecture/`。**

行業最大 design flaw：AI 不斷取悅玩家、NPC 冇靈魂、玩家想做乜就做乜。我哋嘅解法（2026-06-01 founder 梳理後 lock）：

**核心哲學（4 條，詳見 `pm/architecture/01-philosophy.md`）**：
1. 移除硬寫死 · 改用 AI 推導（emergent over hardcoded）
2. GM 係 prep 員，唔係決策者
3. 四層優先級：世界 > 角色 > 當下場景 > 玩家指令（低層唔可推翻高層）
4. 平台只守法律底線（CSAM / 真實傷害），故事內容零自我審查

**① 角色三層靈魂**（`03-character-soul.md`）— 角色唔係寫死嘅 trait 清單：
- 出身（永久 anchor）+ 經歷日誌（累積）+ 當下狀態（即時）
- 沉澱張力機制：角色經歷沉澱消化先作決定，重大事一次夠、細微事要累積（threshold 由角色易變度定）
- 玩家可透過長期經歷真正改變角色性格

**② 4 層記憶 + 角色記憶宮殿**（`04-memory.md`）— 近期全文 + 滾動摘要 + RAG 向量 + 自動 lorebook，加角色信念演化圖譜（temporal graph：角色信念會隨經歷被推翻更新）

**③ GM = prep 員 + 四層 context + 單 Narrator LLM**（`02-turn-pipeline.md`）— 每回合一個 LLM call。GM 整理好分層 context 交俾 Narrator，Narrator 自己決定世界點回應。**取代咗舊嘅 Director Model verdict 仲裁**（舊系統對 ambiguous case 過敏 over-reject，見 `decisions.md` ADR-001）

**④ 故事自適應系統 + 介面**（`05-game-system.md` / `06-generative-panels.md`）— 每個故事 AI 生成適合佢嘅 mechanics（D&D 擲骰 / JRPG 回合制 / 寵物捕捉 / 純小說無）+ 揀適合嘅介面 panel

**外部參考**：MemPalace（記憶藍本，藍本重建唔內嵌）+ OpenDesign（panel 概念啟發）— research 結論喺 `04-memory.md` / `06-generative-panels.md`。

**Phase placement**：呢個係 launch 前嘅核心重設計，DESIGN LOCKED · IMPLEMENTATION PENDING。實作優先級：角色靈魂 > GM 重構（本質同一件事）> 自適應介面。

---

## 技術選擇（已 lock）

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js 16 (App Router · Turbopack) + TypeScript + React 19 |
| UI | Tailwind v4 + shadcn/ui + Framer Motion |
| Database / Auth | Supabase（Postgres + pgvector + Auth + Storage + Realtime + Edge Functions） |
| LLM 抽象層 | Vercel AI SDK |
| LLM provider | **CrazyRouter（aggregator）+ Anthropic direct ONLY**（HK founder 攞唔到 OpenAI/Google/xAI direct key，亦唔用 OpenRouter）。base `crazyrouter.com/v1` |
| Embedding | text-embedding-3-small (1536-dim, 中文友好) · 經 CrazyRouter |
| Payments | Stripe Subscriptions + Checkout（live mode · HKD） |
| 年齡驗證 | **冇（已 cancel）— 成人模式 = 自我聲明 18+ checkbox** |
| Email | Resend |
| Analytics / Errors | PostHog + Sentry |
| Hosting | Vercel + Supabase |
| i18n | next-intl，繁中 default，簡中 + EN day-1 ready |
| **Domain split** ✅ DONE 2026-05-28 | **kieio.com** = marketing (`/` `/pricing` · future `/about` `/blog` `/terms` `/privacy`) · **app.kieio.com** = product (`/login` `/auth/callback` `/library` `/my` `/play/*` `/stories/new` `/settings` `/profile` `/memory`) · middleware.ts 308 redirects on host mismatch · cookies scoped `.kieio.com` (parent) for cross-subdomain session · `lib/urls.ts` `getAppOrigin()` / `getMarketingOrigin()` helpers are single source of truth for cross-subdomain URLs (ALL auth `redirectTo` / `emailRedirectTo` MUST use `getAppOrigin()` — see hard rule #35) |
| **Post-login landing** | Has playthrough → `/my` · zero → `/library` · **NEVER** `/profile` · `lib/auth/landing.ts:getLandingPath` is single source of truth · `/auth/callback` + root `/` both branch on it |

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
| — | **`pm/architecture/` folder** | 🚨 核心架構（記憶 / 角色靈魂 / GM / 自適應系統）— 處理呢啲嘢前必讀。一個系統一份文件 + 索引 + 名詞表 + ADR |
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
19. **後台 differentiator 要俾 user 感受到 — 但透過敘事流露，唔係 dashboard** — ⚠️ **2026-06-01 founder 修正**：呢條 rule 原本寫「一定要有 Memory Journal UI（抄 NovelAI lorebook）」，但嗰個係基於「抄 NovelAI」嘅舊理解，同 founder lock 咗嘅沉浸感原則（`pm/architecture/06`）**直接衝突**。Founder：「睇哈利波特小說都唔會將佢所有嘢列晒出嚟，你只會透過文字大概感受到」。**正確理解**：護城河（記憶/角色靈魂）嘅「可見」= 玩家喺**故事敘事入面**自然感受到「AI 真係記得、角色真係變咗」（角色提起過去、語氣行動體現關係）—— 而**唔係**一個列表式 journal / 好感度數字條 / dashboard（嗰啲破壞沉浸感）。即係話：確保 Narrator 真係喺敘事體現記憶（M4 做緊嘅嘢），而唔係整個 UI 列表。任何關係/狀態顯示如果要做，都係 `pm/architecture/06` 嘅自適應 panel（AI 揀、質性顯示），唔係裸數字。**唔好再用「一定要 Memory Journal UI」呢個舊講法。**
20. **Audit cost projections 永遠 underestimate** — Phase 2 原本估 ~2% memory overhead，實際係 ~35% on Narrator baseline。每次 add LLM call 都要 re-baseline 真實 per-turn cost vs subscription tier pricing。Adventurer $9.99/mo 200-turn = $4.60 = 46% COGS。
21. **Founder priority rule — Function → UI → Money** — Phase number 唔等於 execution order。Founder explicit 講：先完成所有 product **function**（story engine / memory / community / adult mode logic / official content），再 **UI** design（library / Memory Journal / locale switcher / Settings polish / Library UI），最後先做 **money**（credits UX / Stripe / refund saga）。Session 7 嗰陣 Phase 3 credits 順序排錯 — 屬於 money tier 但做咗喺 function 完成之前。**任何時候建議 next move 之前 check：佢屬邊個 tier？高 tier 嘅 deferred work 唔該先做晒**。（註：KYC 年齡驗證已 cancel，成人模式 = 自我聲明 18+）
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
32. **Manual E2E DEFERRED to post-UI tier · 唔逐 phase 測** — Founder rule (2026-05-23): 「實質測試個產品我係希望等完成咗UI之後先一次過測試,唔好再叫我測試喇依家」。Function tier ship + audit converged (3 consecutive zero-ship-blocker cycles per #29) = sufficient quality signal · don't gate next-phase progression on founder E2E。Per-phase E2E checklist (manual-e2e-phase*.html) 仍然 write 留住做 final comprehensive E2E suite 嘅 base — UI tier 完之後 expand 覆蓋 polished flows · 一次過測整個 final product。Never propose「Manual E2E next」之間 phase。
33. **Phase 7 (5 官方故事) = last-stage SMALL task · NOT function-tier priority** — Founder rule (2026-05-23): 「呢啲官方故事嗰啲嘢係好細嘅嘢可以去到最後個 stage 先做㗎喎」+「整撚晒啲 backend 啊 function 嘢先」。Phase 7 是 creative content writing · 唔係 technical backend work。**Within function tier, ALWAYS prioritize technical/code work over creative content writing**。Order: Phase 6 non-money (technical) → Phase 1.5/2 audit polish (technical) → other backend → UI tier → Money tier → **FINAL STAGE: (a) Phase 7 5 stories (small · ~1 session) + (b) Comprehensive E2E**（同一個 burst · founder 寫故事時平台 launch-ready · stories 即時 showcase polished UX）。Never propose Phase 7 as「next after Phase X」during technical phases。
34. **Customer-facing copy ≠ internal strategy text** — Session 15 lift 咗 CLAUDE.md「對手要 6-12 個月先抄到」(internal competitive moat assessment) 入 marketing pill · founder catch (繁中 vulgarities)。Competitor trash-talk in own marketing 係 unprofessional + signals insecurity。**任何 customer-facing copy (marketing · product UI · email · error messages) 永遠 user-benefit framing · NEVER lift 自 CLAUDE.md / DECISIONS.md / pm/STATUS.md 嘅 strategy / competitive / technical advantage talk**。寫之前自問：呢句寫俾用戶睇 · 定寫俾自己 / 投資者睇？只有後者啱 candid。Internal docs 仍然繼續 candid · 但只活喺呢度 · 唔輸出。
35. **Cross-subdomain auth redirect 永遠用 `getAppOrigin()`** — Session 15 Google login regression：`authRedirectBase()` 用咗 `NEXT_PUBLIC_SITE_URL` (post-split = marketing host kieio.com) → OAuth callback 落 marketing host → Supabase 喺 marketing 域 set cookie → middleware redirect 入 product host (app.kieio.com) → cookie 唔見 → user 表面 unauth (但 Supabase 顯示 session 已成功)。Silent failure mode。**所有 auth `redirectTo` / `emailRedirectTo` MUST 用 `getAppOrigin()` from `lib/urls.ts`**。唔可以 fall back `headers().get("origin")` (browser-controlled · phishing vector) · 唔可以直接用 `NEXT_PUBLIC_SITE_URL` (post-split 已 = marketing host)。Cookie scope 永遠係 parent domain (`.kieio.com`) · 等 marketing + product 都讀到 session。
36. **Spec-vs-code drift = documentation hygiene failure** — Session 15 揾到 pm/STATUS.md Pricing v3 line 74 講「Free signup 1k + 50/day」但 Migration 0001 column default + Migration 0008 trigger 淨係 grant 50。Drift undetected since launch · only caught when founder explicit 問「register 之後到底拎幾多?」。Migration 0033 fix (1000 + backfill +950)。**每次 ship new feature 應該 scan spec docs for related claims · validate code 真係 match · 唔好 trust the doc just because 你 wrote it**。Spec docs 可以同 code 同樣 wrong · 兩邊都要 cross-verify。Founder 一旦 explicit 問細節 = high signal 你應該即刻 check 兩邊 sync。
37. **核心架構（記憶 / 角色靈魂 / GM / turn pipeline / 自適應系統）改之前必讀 `pm/architecture/`** — Session 16 (2026-06-01) founder 梳理咗成套核心架構入呢個 folder。任何 session 要動角色 / 記憶 / Director / turn pipeline / panel 之前，**一定要先讀 `pm/architecture/README.md` 再讀對應文件**，因為 code 現狀同 target 架構有 drift（舊 Director Model 要 deprecate），唔讀就會基於過時理解做嘢。呢度嘅 5 個 ADR (decisions.md) 係 DESIGN LOCKED。
38. **唔好靠估 — 唔肯定就查實** — Session 16 兩次靠估出錯：(a) 估生圖 host 用錯 → grep 證明三個 call 同一 host，host 唔係 bug；(b) 估 skill modal 闊度爆 mobile → 原來真正 component 係另一個 inline 版本。每次都係即刻自我驗證先避免將錯誤寫入 memory 累下個 session。**凡係診斷 bug / 評估外部 project / 講某段 code 點 work，一定要實際讀返個 code / 攞真實 log / probe 真實 endpoint，唔好靠記憶或者推測落結論。** Founder downloaded MemPalace + OpenDesign 就係要我讀真實 source 先判斷，唔係估。

---

## Open Items（待解決）

**核心架構重設計（Session 16 · 詳見 `pm/architecture/`）**：
- NPC Agent L3（角色 POV 思考）喺新架構：維持付費 / 全部 default / hybrid？
- 現有 state panel 嘅裸好感度數字條 — 改質性顯示定交 AI 決定要唔要 expose？
- MemPalace 中文 entity 處理直接借用定改良（要 spike 驗證）
- 角色經歷日誌 + 信念圖譜寫入：用 LLM 抽（準但貴）定 regex（慳但漏）？

**其他**：
- 內容 moderation 嘅具體實作（哪個 provider、CSAM filter source）
- Lorebook entity 同名 dedup 策略（「阿明」vs「陳家明」）— 用 naive exact match 先

---

_Last updated: 2026-06-01 (Session 16 — 🧭 CORE ARCHITECTURE REDESIGN · founder 梳理「記憶 + 角色靈魂 = 產品最重要」· 開咗 `pm/architecture/` folder（哲學 / turn pipeline / 角色靈魂 / 記憶 / 自適應系統 / 自適應介面 + 5 ADR + 名詞表）· GM 由決策者降做 prep 員（取代舊 Director）· 角色三層靈魂 + 沉澱張力 · MemPalace 藍本重建唔內嵌 · 移除角色硬紅線只守法律底線 · DESIGN LOCKED IMPL PENDING · 🐛 同場修好 play 兩個 bug（skill 徽章 live + 生圖 fallback chain）PR #51 已 merge prod · added hard rules #37-38 · 🏁 next = 角色靈魂 + GM 重構實作)_
