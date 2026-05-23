# Prompt for Claude Design — Phase B fixes + Phase C

> Copy ✂️ 之間嘅嘢俾 Claude Design。

---

## ✂️ COPY FROM HERE ✂️

Phase A 4 corrections all landed correctly (CH.12 dropped from atoms showcase · 試玩 20 turns → 即時開始 · 進行中 scenario → 已發佈 N 故事 · updated 2 min → 最近發佈 N 分鐘前). Phase B Play screen + Memory Journal mostly excellent — 4-axis disposition surfaced, skill check failure permanent with no retry, Director rejection rendered with amber side-border, Memory Journal 3 tabs + 4-layer correctly mapped, CSAM strip in adult mode, all error states designed. Good work.

Five things to fix before Phase B is closed, then proceed Phase C.

---

## 1. Phase B fixes

### 1.1 Memory is **per-playthrough**, not per-story · plus 100% read-only

A clarification on the product model that affects multiple parts of `memory-journal.jsx`:

**Memory scope** — every memory layer (recent turns / summaries / RAG vector / lorebook) is scoped to the **playthrough_id**, not the story_id. Two players playing the same story have completely separate memories. The same player can fork the same story twice and the two playthroughs have completely separate memories. Backend RLS already enforces this (verified).

**User cannot modify memory** — founder explicit rule (2026-05-23): users can READ their own memory via Memory Journal, but CANNOT mutate it. Backend just shipped Migration 0018 locking down all INSERT/UPDATE/DELETE on memory tables from authenticated role · memory writes only happen server-side via `after()` post-stream. This is now enforced at the database level.

**Action**:

- Drop the「編輯」button entirely from `memory-journal.jsx` line ~105-110 LoreCard component. Don't keep it as a v1.5+ placeholder — the founder rule is no edit, ever. Memory Journal is 100% read-only.
- Add a small read-only affordance to the lorebook card. Examples (designer picks):
  - Lock icon + tooltip「AI 自動記錄 · 不可編輯」
  - Section header line「AI 為你寫嘅記憶」
  - Footer caption「呢個記憶 only 屬於呢個 playthrough · fork 第二次會係空白」
- Add per-playthrough reinforcement to Memory Journal header. Current header「回憶錄 · 銅鑼灣偵探事務所 · 扮演 陳 Sir · TURN 14 · 4 層記憶」is close, but「扮演 陳 Sir」may not be enough signal that this is THIS playthrough's memory. Suggest something like:
  - Sub-line: 「呢個 playthrough 嘅獨立記憶 · 同其他玩家分開」
  - Or rephrase: 「你呢次扮演 陳 Sir 嘅記憶」

### 1.2 Active Memory「never empty · always returns top-3」is incorrect

`phase-b-play-memory.html` postit at line ~163:
```
Active memory: never empty (RAG always returns top-3, even on turn 2).
```

Backend retriever uses similarity thresholds (summaries 0.55 · RAG 0.5 · lorebook 0.45) — per CLAUDE.md hard rule #18「Top-K retrieval 冇 similarity floor 等於 noise by design」. Empty result beats noise.

**Action**:

- Drop the「always returns top-3」claim from the postit.
- Add an empty state for the 當前活躍記憶 (Active Memory) tab. Copy suggestion (designer can rephrase):
  > 「呢個 turn AI 冇 retrieve 出特別相關嘅過往記憶。佢純粹用近 20 turn 嘅 context 同你嘅 Story Bible 寫敘事。」
- This empty state is reachable on early turns or when player asks something semantically far from past content.

### 1.3 Source labels in `ACTIVE_MEMORIES` conflate memory layers

`memory-journal.jsx` line 51-60 sample data:
```js
{ source: '近 20 turn' }  // wrong — that's the LAYER name, not the SOURCE
{ source: '滾動摘要' }
```

The postit at line 140-143 correctly maps:
- RAG vector → 當前活躍記憶
- 滾動摘要 → 回憶錄  
- Lorebook → 角色記事
- 近 20 turn → already in narrative stream (not retrieved separately)

But the sample data uses「近 20 turn」as a SOURCE label on a retrieved item, which contradicts the postit (recent-turns layer is in the prompt verbatim — not retrieved via RAG). If current turn is 14, turn 13 is already in the prompt as raw text · it shouldn't appear as a「retrieved」memory.

**Action**:

- Change source labels in `ACTIVE_MEMORIES` sample to reflect actual backend layer names that CAN be retrieved:
  - `近 20 turn` → `過往 turn` or `相似片段` (RAG retrieves past turn embeddings — these are turns that fell out of the recent-20 window OR are highly semantically similar despite being recent)
  - `滾動摘要` keep — that's accurate
  - Add a third example with `Lorebook · 角色` or `Lorebook · 物品` to show entity retrieval (Lorebook entries can also be retrieved via the lorebook match RPC)

### 1.4「Director 微調」label leaks system jargon

`play.jsx` line 240 currently:
```jsx
{soft && <span style={{ color:'var(--warn)' }}>· Director 微調</span>}
```

Hard rule #4 says Director rejection must be 100% in-fiction. The amber border is fine (subtle hint). But the「Director 微調」 label exposes that there IS a Director system — it's meta-system jargon that breaks immersion. Postit line 100 claims the label is「invisible to first-time eye sweep」but the code renders it inline visible.

**Action** (designer picks one):
- (A) Drop the label entirely. Keep only the 2px amber side-border as subtle hint. Power users discover via tooltip on the border, casual users just experience the NPC pushback in narrative.
- (B) Replace「Director 微調」with an in-fiction term that doesn't mention the Director system: 「· 出乎預料」/「· 別嘅嘢發生咗」/「· {NPC 名} 反應」— wraps the meta into narrative voice.

Either works. (A) is purer.

### 1.5 Missing skill check outcomes — only failure designed

Backend returns 4 outcomes: `critical_success` / `success` / `failure` / `critical_failure`. Phase B only has `failure` (artboard C5).

**Action**: Add 3 more outcome variants. Design freedom on color / iconography / copy — but cover:

- `success` — d20 + skill ≥ difficulty. Probably ok-green tint. Cost is usually moderate progress / positive disposition.
- `critical_success` — natural 20 OR over-shoot by 10+. Special highlight (sparkle / accent flash). Bonus narrative effect (e.g., NPC unlocks new dialogue / earned exception triggered).
- `critical_failure` — natural 1 OR under-shoot by 10+. More dramatic than failure — bigger disposition swing / NPC walks away permanently / lasting reputation damage. Danger-red dramatic styling.

All 4 share the「PERMANENT · 不可重試」rule.

### 1.6 Mobile Memory Journal entry point missing

`play.jsx` mobile tabs are: 敘事 / 角色 / 狀態. No path to Memory Journal.

**Action**: Add a mobile entry point. Designer picks:
- (A) Add a 4th tab「記憶」
- (B) Top-right icon (replacing or alongside settings)
- (C) Inside「角色」tab subnav

### 1.7 Minor: moderation block copy too specific

`play.jsx` ErrorActionBlocked body currently says:「平台嚴禁涉及未成年、真實人物、或極端暴力嘅內容」

Backend's moderation actually blocks: CSAM (sexual_minors) · violence/graphic · threatening · harassment · hate · illicit. We don't block「真實人物」specifically (no face recognition).

**Action**: Generalize copy. Example:
> 「呢個 action 觸發咗安全規則 — 平台嚴禁涉及未成年人、極端暴力、自殘、或仇恨內容嘅創作。你嘅 action 並未送俾 AI。試下用其他講法。」

---

## 2. Proceed Phase C — Creation wizard + Settings + Login + Locale switcher

Once Phase B fixes done, build Phase C in light mode using the Phase B aesthetic system.

### 2.1 Story creation wizard (`/stories/new`) — per Brief section 5.5

**Functional requirements** (from `UI_DESIGN_BRIEF.md`):

- Inputs: `prompt` (premise · multi-line) · `genre` · `language` (zh-Hant / zh-Hans / EN) · `content_rating` (general / pg13 / mature / adult) · `protagonist_hint` (optional) · narrator model picker
- Model picker filter by user tier + adult_mode (mirror server enforcement)
- **「Adult」content_rating button disabled unless `adult_mode_enabled`** · UI hint「需要喺 Settings 開啟成人模式」+ deep-link to Settings (Hard rule #10)
- Submit triggers 4 parallel LLM calls (~35-50s) — progress UI must show 4 sub-tasks running concurrently:
  - Meta + opening narrative
  - State schema generation
  - Story Bible
  - Character cards
- Estimated cost shown upfront (cheap · ~5-10 credits one-time)
- Failure path (e.g., 403 moderation reject) — friendly retry · no half-baked stories saved
- Mobile + desktop responsive
- Empty / loading / error states designed (matrix per page · Hard rule #8)

### 2.2 Settings page (`/settings`) — per Brief section 5.6

**Sections**:

- **Profile** — display_name (text input) · email (read-only) · avatar · locale dropdown (繁中 / 简中 / EN)
- **Preferences** — default narrator model picker (tier + adult_mode-aware) · UI density / theme placeholder (theme toggle out of scope · light only at launch)
- **Adult mode** — 3-state toggle:
  - `not_verified` — locked · explanation card「需要完成身份驗證 (KYC · Stripe Identity · Phase 6 money tier 嚟緊)」
  - `verified + off` — flippable
  - `verified + on` — shows「已開啟」+ warning that disabling will reset NSFW default model
  - **CSAM hard-rule reminder ALWAYS visible regardless of state** (Hard rule #2) — same copy / different placement as Library + Memory Journal banner
  - Enable confirmation: re-display CSAM reminder + explicit consent click each time user enables (P6-LOW-01 audit backlog)
- **Credits** — current balance · ledger history placeholder · top-up button (Phase 4 money tier — placeholder OK)
- **Account** — sign out · delete account placeholder

### 2.3 Login / Auth (`/login`) — per Brief section 5.7

**Elements**:

- Email magic link input + send button
- Guest mode (anonymous sign-in) one-click button + explainer「1-click 試玩 · 後尾可以保存」(real backend behavior: anonymous user uses standard credit ledger · no enforced 20-turn cap)
- Post-login: redirect to library OR `?next=` URL if returning to specific story
- Sign-out + session expiry friendly handling
- Mobile + desktop

### 2.4 Locale switcher (cross-cutting) — per Brief section 5.8

- Options: 繁中 (default) / 简中 / EN
- Persistence: cookie + next-intl middleware
- Placement: designer decides (header / footer / Settings only / etc.)
- Should be reachable from every page

---

## 3. Hard rules reminder (no change · Brief section 4)

1. 繁中 default · zh-Hans + EN i18n-ready · no hard-coded strings
2. CSAM reminder always visible in adult mode UI
3. NSFW model + adult content_rating filter reflect adult_mode_enabled
4. Director rejection in-fiction · never system error
5. Skill check failure permanent · no same-turn retry
6. 4-axis disposition must be visible in play screen
7. Memory Journal must surface 4-layer memory
8. Every page has empty / loading / error states
9. Mobile + desktop responsive · 360px min
10. Adult content_rating creation button disabled unless adult_mode_enabled

Plus, new rule from this round:

11. **Memory is per-playthrough · 100% read-only · user cannot mutate**. UI must reinforce both via copy + by removing any edit affordance.

---

## 4. Deliverable format (same as Phase A / B)

- HTML mockup file: `phase-c-creation-settings-login-locale.html` (or similar split)
- JSX page mockups: `creation.jsx` · `settings.jsx` · `login.jsx` · `locale.jsx` (or combined where natural)
- Postit notes per artboard: design moves · audit IDs addressed · backend dependencies for engineer
- Mobile + desktop variants per page
- Empty / loading / error states matrix per page
- Update tokens.css if any new tokens needed

Pause for user review after Phase C. After approval, engineering session will implement Phase A + B + C in React using the new light tokens.

## ✂️ COPY TO HERE ✂️

---

## 用法

1. Continue 現有 Claude Design conversation 或者開新 session
2. Copy ✂️ 之間嘅嘢落去
3. Designer fix Phase B 7 個 item + 出 Phase C 4 個 page mockup
4. 你 browser review · approve
5. Approve 後 → engineering session implement entire UI tier 落 React
