# Story Engine — UI Design Brief

> 俾 designer 知道 product 係乜 · 有咩 function · 有咩 page 需要做。視覺方向由 designer 決定。

---

## 1. Product 係乜嘢

**Story Engine** — 中文圈嘅互動式故事 RPG webapp。用戶可以：
- 自己用 prompt 生成一個故事世界 + 角色 + 玩法 + UI
- 玩自己或者其他人創作嘅故事，每個 turn 用文字 input 同 AI 互動
- 角色有自己嘅性格、紅線、好感度，唔會做玩家想佢做嘅嘢
- 揀唔同 AI model（Claude / GPT / Gemini / Grok / Open Source）
- 訂閱 + credits 制 · 成人模式分流

**目標市場**：HK + TW first（繁中 dominant · zh-Hans + EN day-1 ready 透過 next-intl）· 之後其他海外華人。

**Live prod URL**：https://story-engine-drab.vercel.app

**Solo dev MVP** · backend + minimal UI 完成 · production live · 而家需要設計師 redesign 個 player-facing UI。

---

## 2. Backend / Function 已經有咩

呢啲全部 ready · designer 唔需要諗 implementation · 只需要設計點樣 surface 出嚟：

### 故事創作
- 用戶輸入一個 prompt（e.g.「TW 大學校園戀愛故事」）
- AI 同時跑 4 個 parallel LLM call 生成：(a) 故事 meta + opening narrative (b) 自適應 state schema (好感度條 / HP 條 / 數據儀錶板 etc.) (c) Story Bible (世界規則 + 紅線 + 故事弧) (d) Character cards (NPC 性格 + 紅線 + voice)
- 約 35-50s 完成 · 過程要有 progress UI
- 內容審核 pre-filter (OpenAI Moderation · CSAM/illegal block)

### 玩法 (turn loop)
- 玩家寫 action 文字 input
- 後台 pipeline：moderation → memory retrieve → Director Model 仲裁 → Narrator stream 寫敘事 → state delta apply → embed/summarize/lorebook 後台跑
- Director 可能：直接 allow / require skill check / reject (用 NPC in-fiction pushback · 唔係 system error message) / allow with constraint
- Skill check：dice roll (d20 + skill_value vs difficulty) · 結果有 critical_success / success / failure / critical_failure · **失敗永久 · 唔可以同一 turn retry**
- 每個 NPC 有 4-axis disposition：**trust / romance / respect / fear** (-100 to +100) · Phase 1.5/2 polish 啱啱 seed · 需要 UI surface
- State panel 跟住故事自適應（9 個 atomic renderer：bar / meter / ring / enum / inventory / counter / list / relationship-graph / text · 由 dispatcher 揀邊個 render）

### 長期記憶 (4 層)
- 近 20 turn 全文 (system prompt)
- 滾動摘要 (每 10/20 turn fire 一次 Haiku rollup)
- pgvector RAG (turn embeddings · 相似 turn retrieve)
- Lorebook (auto-extracted entity：character / place / item / event / concept)
- **呢個係護城河 feature · player 而家 0 visibility · 需要 Memory Journal UI surface**

### 社群
- 用戶可以發佈自己嘅故事去 Library (public/private/unlisted)
- 評分 (1-5★) · nested comments (1-level deep) · soft-delete · report
- Library 有 multi-board carousel：🔥 熱門 / 🆕 最新 / 💕 戀愛 / ⚔️ 冒險 / 🎓 校園 / 🔮 奇幻 / 🏀 運動 / 🕵️ 懸疑
- CJK FTS 搜尋 (繁中 + 簡中) · trending cold-start boost
- Fork：揀人哋故事 → 改主角名 + 揀 model → 開新 playthrough

### 多 LLM + Credits
- Model picker：Claude Sonnet 4.6 (default) / Haiku 4.5 / Opus 4.7 / GPT-4o / Gemini 2.0 Flash / Grok 3 / Llama 3.1 405B Uncensored (NSFW · OpenRouter only)
- Tier gate (Free / Adventurer / Creator) · 每個 model 有 min_tier 要求
- Credits ledger append-only · 每個 turn 扣 credits 按 model price
- 估計 cost 喺 turn 之前顯示

### 成人模式
- Settings toggle · 但 enable 需要 KYC (Stripe Identity · Phase 6 money tier · 而家未 build)
- enable 後 ModelPicker 多出 OpenRouter NSFW model · creation form 可以揀 adult content_rating · Library 多出 Adult 18+ filter option
- disable 後自動將 NSFW default model reset 返做 Sonnet 4.6 (避免 user stuck)
- CSAM/illegal pre-filter 永遠 on · 無論成人模式 on/off

### 認證
- Supabase Auth · email magic link · OR anonymous「Guest mode」(1-click 試玩)

---

## 3. 需要設計嘅 Pages

### A. Library page (`/library`)
**功能**：
- 多 carousel board：熱門 · 最新 · 6 個 genre · 我嘅故事 (logged-in) · 繼續玩 (有 active playthrough)
- 每個 story card 要 show：cover image (有 fallback) · title · author display_name + avatar · tags · genre · content_rating · play_count · 平均 ★ rating · description preview
- 搜尋 (top-bar · CJK + Latin · empty state for 1-char query)
- Filter：language · genre · content_rating (Adult 18+ option **只可以喺 adult_mode_enabled=true 時 render**)
- Smart-hide empty carousel
- 未 logged in user：landing + login CTA + sample stories
- Mobile + desktop responsive

### B. Story detail page (`/stories/[id]`)
**功能**：
- 故事 meta：title · author · cover · description · tags · genre · content_rating · stats (play_count · rating distribution · comment count)
- Opening narrative preview (collapsible)
- 「開始扮演」CTA → fork modal (改主角名 + 揀 model) → 開 playthrough
- 「玩自己嘅 playthrough」 button (if 已 fork)
- 5★ 評分 + 1-line review (only if 唔係自己嘅故事 + 未評)
- Nested comments thread (reply · soft-delete · report)
- Owner 可以見：「已發佈」status + toggle public/private + edit (出 backlog · 唔需要 design)

### C. Play screen (`/play/[id]`)
**功能**：
- Narrative stream display (AI turns + 玩家 action history)
- Action input (textarea · send · char count)
- Dynamic State Panel (9 atomic renderer · dispatcher 揀邊個 render)
- **4-axis disposition 顯示 (trust / romance / respect / fear) per NPC** — 而家 backend seed 咗 · UI 未 surface
- Skill check UI：dice roll animation · 顯示 d20 + skill_value vs difficulty · outcome (4 種)
- Loading states：
  - moderation phase (after 600ms)
  - AI 思考 phase (Director + Narrator streaming)
- Error states (現有 backend 會 return)：
  - 400 action_blocked (content moderation reject)
  - 402 insufficient_credits
  - 403 model_tier_required
  - 403 adult_mode_required (model 或 story 兩種 case)
  - 503 moderation_misconfigured
- Refusal / Director rejection：要 in-fiction render (NPC pushback) · **唔可以變 system error**
- Memory Journal access (sidebar / drawer / page · designer 決定)
- Mobile + desktop responsive

### D. Memory Journal UI (NEW · per playthrough)
**功能**：
- 顯示 3 種 memory：
  - 回憶錄 (rolling chapter summaries · 第一個 fire 喺 turn 10)
  - 角色記事 (lorebook entries · grouped by type：character / place / item / event / concept · always_on entries pinned)
  - 當前活躍記憶 (per-turn 嘅 top RAG-retrieved memories · 顯示「AI 因為呢段記住...」)
- Empty state (turn 1-9 未有 summary)
- 將來可能加：玩家 edit lorebook entry (backend RPC 需要 build · 而家 skip · designer 預留 UI hook 就得)
- Mobile + desktop responsive

### E. Story creation wizard (`/stories/new`)
**功能**：
- Input：prompt (premise) · genre · language · content_rating (general / pg13 / mature / adult) · protagonist_hint · narrator model picker
- 「adult」content_rating option **只可以喺 adult_mode_enabled=true 時 enable**
- Model picker filter by user tier + adult_mode
- Submit → 4 parallel LLM call · ~35-50s · 要顯示 progress (4 個 sub-task：meta / state schema / bible / characters)
- 失敗 path (e.g., moderation 403)：friendly retry · 唔可以留低 half-baked story
- 估計 cost 顯示 (cheap · 一次性 5-10 credits)
- Mobile + desktop responsive

### F. Settings page (`/settings`)
**功能**：
- Profile：display_name · email (read-only) · avatar · locale
- Preferences：default narrator model (tier + adult_mode-aware) · 將來可能加 default temperature / UI density
- Adult mode：3-state toggle (not_verified / verified+off / verified+on)
  - not_verified：locked · explain KYC requirement · 「Phase 6 money tier 嚟緊」
  - verified+off：flippable
  - verified+on：show「已開啟」+ disable 之後會 reset default model 嘅 warning
  - **CSAM hard-rule reminder 永遠 visible · regardless of state**
- Credits：current balance · ledger link (將來 build) · top-up button placeholder
- Account：sign out · delete account placeholder
- Mobile + desktop responsive

### G. Login / Auth (`/login`)
**功能**：
- Email magic link input + send button
- Guest mode (anonymous sign-in) one-click button + explainer「1-click 試玩 · 後尾可以保存」
- 已 logged in → redirect to library 或者 `?next=` URL
- Sign-out handling · session expiry friendly handling

### H. Locale switcher (cross-cutting · all pages)
**功能**：
- 繁中 (default) · 简中 · EN
- 點 → set cookie + reload · next-intl middleware handle 落 URL
- Designer 決定 placement (header / footer / settings only / etc.)

---

## 4. Hard Rules (functional · 唔關 style)

呢啲係 product / legal / security 層面嘅 hard requirement · designer 必須遵守，視覺方向自由：

1. **繁中 default · zh-Hans + EN i18n-ready** — 唔可以 hard-code 文字 · 全部用 i18n key
2. **CSAM hard-rule reminder 永遠 visible 喺 Adult mode UI** — 法律底線 · 無論 toggle state 點都要 show
3. **NSFW model + adult content_rating filter 要 reflect adult_mode_enabled** — server 已 enforce · UI mirror
4. **Director rejection in-fiction** — NPC pushback / failed attempt · 唔可以變「Action rejected: ...」system error message
5. **Skill check failure 永久 · 同一 turn 唔可以 retry** — 呢個係 core differentiator · UI 唔可以加「try again」button
6. **4-axis disposition (trust / romance / respect / fear) 必須 visible** — 唔係 hidden 一個就算 · player 要 SEE 個 character 對佢嘅 4 種感覺
7. **Memory Journal 必須 surface** — backend memory 已 ship · 唔 UI surface 等於 0 value · 4 層記憶 (recent / summaries / RAG / lorebook) 至少要見到 summaries + lorebook
8. **Empty / loading / error states 每個 page 都要有** — 唔可以淨係 design happy path
9. **Mobile + desktop responsive · 360px minimum width**
10. **「成人」content_rating button **disabled** unless adult_mode_enabled** — UI hint 解釋點解 disabled (而家係「需 KYC」· 可能改) · deep-link to Settings

---

## 5. 用戶背景

- HK + TW 中文圈 · ages 18-35 dominant
- Solo player 為主 (唔係 multiplayer)
- 玩故事 session 通常 10-50 turn · 一次玩半個鐘到 2 個鐘
- 平台 reference：AI Dungeon (英文) · Character.AI (英文 · 偏 chat) · NovelAI (英文 · 偏 LLM toolkit)
- 中文圈而家 0 大 player serve 緊 · 藍海

---

## 6. Tech stack (functional constraint)

- Next.js 16 (App Router) + TypeScript + React 19
- Tailwind v4 + shadcn/ui (component library 已 install)
- Framer Motion (animation library 已 install)
- next-intl (i18n)
- Supabase (auth + DB + storage)

Designer 唔需要寫 React · 但 mockup 出嚟嘅嘢要 implementable 喺 above stack。

---

## 7. Existing files designer 可能需要參考

| File | 用途 |
|---|---|
| `CLAUDE.md` | Product soul · hard rules · founder voice |
| `pm/STATUS.md` | 而家 ship 咗咩 · 未 ship 咩 |
| `pm/BACKLOG.md` | 「Phase 5 deferred polish」+「Phase 6 + 1.5/2 polish deferred」section · 入面有 audit team flag 出嚟嘅 UI 待修 item · designer 設計時 cover |
| `web/src/app/[locale]/library/page.tsx` | 而家 library page (功能 working · 視覺 minimal) |
| `web/src/components/play/DynamicStatePanel.tsx` | 9 個 atomic renderer dispatcher |
| `web/src/components/play/play-client.tsx` | 而家 play screen (功能 working · 視覺 minimal) |
| `web/src/components/settings/adult-mode-toggle.tsx` | 3-state adult mode toggle pattern |
| `web/messages/zh-Hant.json` | 而家有嘅 i18n string |

---

## 8. 不在 scope 內 (designer 唔需要做)

- Backend RPC / Supabase migration / API endpoint design
- LLM prompt engineering (narrator / director / lorebook)
- Credits ledger logic · Stripe checkout · KYC flow
- Phase 7 官方故事 content writing
- Authentication mechanics (magic link · OAuth · session)
- Dark mode (deferred to v1.5+ · 除非 designer 想 propose 多一個 deliverable)
- 寫 React component (HTML mockup 先 · 之後 engineer session implement)
- 寫 i18n message JSON (designer 出 key list · 之後填 message)

---

## 9. 期望嘅 Deliverable

Designer 自己決定點交，但需要包含：

- 8 個 page 嘅 visual design (HTML mockup 或者 Figma 或者其他 designer prefer 嘅 format)
- 每個 page 嘅 desktop + mobile breakpoint (tablet optional)
- Empty / loading / error states per page
- Component-level note (reusable atom + 邊度用)
- Motion spec (邊啲 element animate · 點 animate)
- i18n key list (designer 用嘅每個 string)
- Audit-deferred UI item address (見 `pm/BACKLOG.md`)

---

_Brief generated 2026-05-23 · function tier complete · ready for designer to take over visual direction._
