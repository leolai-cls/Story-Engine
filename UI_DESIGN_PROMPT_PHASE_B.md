# Prompt for Claude Design — Phase A fixes + Light aesthetic system + Phase B

> Copy ✂️ 之間嘅嘢俾 Claude Design。

---

## ✂️ COPY FROM HERE ✂️

Phase A handoff received and reviewed. Most things landed well — story detail correctly framed as scenario landing (not novel page), library Continue Card now shows narrative snippet + disposition delta instead of fake chapters, audit-deferred IDs addressed in postit notes. Good work.

Three things to do before Phase A is closed, then proceed Phase B.

---

## 1. Aesthetic system change — switch to LIGHT theme

Founder reviewed your dark-first direction (你 postit attributed it to founder pick — that wasn't accurate, brief left it open for you to propose). After review, **direction is LIGHT theme, not dark**.

Rationale: HK + TW target market — 大平台 (Wattpad, 起點, Pixiv) light dominant, dark is opt-in. Dark-first launches with mismatch risk against player expectation.

**Action — minimal redo**:

- **DO**: Build a new light-mode aesthetic system artboard (A0 · Atoms equivalent). Update `tokens.css` with light values: `--bg`, `--bg-elev`, `--surface`, `--surface-2`, `--fg`, `--fg-2`, `--fg-muted`, `--fg-dim`, `--border`, `--border-strong`, all the semantic colors (danger/warn/ok), accent (violet still OK but tuned for light bg), and the 4-axis disposition colors retuned for light surface.
- **DO**: Use the new light tokens from this point onwards — Phase B mockups all in light.
- **DON'T**: Re-skin existing Phase A page mockups (Library, Story detail). Leave the dark versions as-is. Engineer will apply the new light tokens at implementation time — token names stay identical, only values change, so existing mockups auto-translate.
- **DO**: Drop the「founder picked dark」postit text since it wasn't true. Replace with neutral rationale or remove.

Keep the LLM-app trope (mono chrome for technical labels, sparse violet accent for primary CTA + brand) — that vibe was good, just on a light surface now.

---

## 2. Four Phase A copy/data corrections

Small fixes — don't redo the page, just correct these specific items:

### 2.1 `phase-a-library-story.html` line ~88 — Atoms typography showcase

Currently shows:
```
TURN 84 · CH.12 · sonnet-4.6 · 2 credits
```

Drop the `CH.12` portion. Our backend has no chapter concept. ContinueCard already fixed — this isolated typography example was missed. New value:
```
TURN 84 · sonnet-4.6 · 2 credits
```

### 2.2 `library.jsx` line ~309 — Visitor landing「試玩 20 turns」claim

Currently shows:
```
無需信用卡 · 試玩 20 turns
```

Backend has no 20-turn cap for anonymous (Guest) users. Anonymous sign-in uses the same credit ledger — they play until credits run out. There is no enforced turn limit.

Change to:
```
無需信用卡 · 即時開始
```
or
```
無需信用卡 · 試玩送 N credits（≈ M turn）
```
(N + M to be filled by engineer based on signup-grant amount when wired)

### 2.3 `story-detail.jsx` line ~129 — Author meta「進行中 7 個 scenario」

Currently shows:
```
[Avatar] Noir @noir · 進行中 7 個 scenario
```

「進行中 7 個 scenario」is ambiguous — could mean published count, active playthroughs, or drafts. Backend exposes published story count cleanly. Active playthroughs are per-user private — other users shouldn't see another author's playthrough count.

Change to:
```
[Avatar] Noir @noir · 已發佈 7 個故事
```

### 2.4 `library.jsx` line ~220 + ~466 —「updated 2 min ago」global metric

Currently shows:
```
1,284 stories · updated 2 min ago
1,284 stories · 2 分鐘前更新
```

Backend has no global library refresh timestamp. Stories are individually trending-scored, not batch-refreshed.

Two options:
- **Drop**: just show `1,284 stories`
- **Replace with real signal**: `1,284 stories · 最近發佈 3 分鐘前` (last story published timestamp — backend can query `max(created_at)` from public stories)

Pick whichever fits the layout better.

---

## 3. Proceed Phase B — Play screen + Memory Journal

Once #1 + #2 done, build Phase B in light mode.

### 3.1 Play screen (per Brief section 5.3)

Backend gives you these functions to surface — `UI_DESIGN_BRIEF.md` section 2 documents the full backend. Key elements:

**Layout components**:
- Narrative stream (AI turns + player action history · scrollable · auto-scroll to bottom on new turn)
- Action input (textarea · send button · char count)
- Dynamic State Panel (9 atomic renderers dispatch by schema · bar / meter / ring / enum / inventory / counter / list / relationship-graph / text)
- **4-axis NPC disposition surface per character** (trust / romance / respect / fear · -100 to +100 · the 4 token colors you already defined) — Hard rule #6, this is the differentiator that proves backend memory + character integrity work
- Memory Journal access (sidebar / drawer / tab — you decide layout)

**Loading states**:
- After 600ms: show「AI 思考中」-style indicator
- Two distinct phases: moderation phase (Shield icon makes sense) vs gen phase (Sparkle icon makes sense) — backend already distinguishes these

**Skill check UI** (when Director verdict triggers it):
- d20 dice roll animation
- Display: `[skill_name] [skill_value]` + `+d20` rolled value vs `Difficulty: X`
- 4 outcomes with distinct colors (your call): critical_success / success / failure / critical_failure
- **PERMANENT** — no retry button same turn (Hard rule #5). Show the cost (e.g.,「陳 Sir 信任 -10」) and force the player to live with it.

**Director rejection rendered in-fiction** (Hard rule #4):
- When Director rejects player action (e.g., player tries to make NPC fall in love instantly · violates red line) — display as NPC pushback or environmental result, NOT as system error message
- Design challenge: signal subtly that AI re-interpreted the action (maybe a thin amber side-border on that turn?) without breaking immersion
- Never show「Action rejected: personality violation」or similar — that destroys the illusion

**Error states from backend** (each is a real HTTP code returned by `/api/playthroughs/[id]/turn`):
- `400 action_blocked` — moderation rejected player input. Show in-app card (Shield icon · friendly framing「呢個 action 觸發咗安全規則 · 試下用其他講法」)
- `402 insufficient_credits` — show balance + topup path (Topup screen is Phase F · placeholder OK)
- `403 model_tier_required` — show tier + upgrade path (placeholder)
- `403 adult_mode_required` — Shield card + deep-link to Settings (same template as Story detail B4 you already built)
- `503 moderation_misconfigured` — friendly「服務暫時不可用」 · retry hint

**Adult content badge**:
- If `story.content_rating === 'adult'` and adult_mode_enabled === true → subtle 18+ badge on narrative area (designer decides placement)
- CSAM hard-rule reminder always visible somewhere (could be tucked in Memory Journal sidebar or Settings — but reachable from Play screen)

**Mobile**:
- 360px min · 3-panel → stacked or bottom-drawer pattern (designer decides)
- Memory Journal access becomes hamburger / tab on mobile

### 3.2 Memory Journal UI (Brief section 5.4 · NEW · per playthrough)

This is the **product moat** — backend's 4-layer memory (recent turns / summaries / RAG vector / lorebook) is the #1 retention differentiator vs competitors. Players need to SEE it working.

**3 sections** (designer decides layout — sidebar tabs / accordion / pages):

1. **回憶錄 (Summaries)** — rolling chapter summaries · backend writes first one at turn 10 · subsequent every ~20 turns
   - Each summary = 1-4 sentence rollup of that chunk of play
   - Empty state when turn_count < 10: 「玩多幾 turn AI 就會開始整理記憶...」+ progress indicator (current turn / 10)

2. **角色記事 (Lorebook)** — auto-extracted entities · grouped by type (character / place / item / event / concept) · `always_on` entries pinned at top
   - Each entry: name · type · description (1-2 sentences AI extracted)
   - User-edit-entry hook in future (P2-UX-C-03 backlog) — designer can reserve a「編輯」button placeholder, backend not yet built
   - Empty state: 「AI 仲未識到呢個世界嘅人物... 玩多啲 turn 就會自動記錄。」

3. **當前活躍記憶 (Active Memory)** — RAG-retrieved top 3 memories that influenced AI's latest turn
   - Format: snippet from past turn + similarity score (or just「AI 因為呢段記住 → ...」framing)
   - Refreshes each turn
   - This is the「proof AI 真係記得」layer — the killer demo moment

**Empty / loading / error states for each section** — never just blank.

**Mobile**: full-page or drawer when accessed from Play screen.

---

## 4. Deliverable format (same as Phase A)

- HTML mockup file: `phase-b-play-memory.html` (or similar)
- JSX page mockups: `play.jsx` + `memory-journal.jsx` (parallel to library.jsx + story-detail.jsx)
- Postit notes per artboard: design moves · audit IDs addressed · backend dependencies for engineer
- Mobile + desktop variants per page
- Empty / loading / error states matrix per page
- Update tokens.css with light-mode values

Pause after Phase B for user review before Phase C (Creation wizard + Settings + Login + Locale switcher).

---

## 5. Hard rules reminder (same as before · per Brief section 4)

1. 繁中 default · i18n-ready · no hard-coded strings
2. CSAM reminder always visible in adult mode UI
3. NSFW model + adult content_rating filter reflect adult_mode_enabled
4. **Director rejection in-fiction · never system error**
5. **Skill check failure permanent · no same-turn retry**
6. **4-axis disposition must be visible in play screen**
7. **Memory Journal must surface 4-layer memory** (at minimum summaries + lorebook)
8. Every page has empty / loading / error states
9. Mobile + desktop responsive · 360px min
10. Adult content_rating creation button disabled unless adult_mode_enabled

## ✂️ COPY TO HERE ✂️

---

**用法**：

1. 開新 Claude session (或者 continue 現有 Claude Design conversation)
2. Copy ✂️ 之間嘅嘢落去
3. Designer 出新 light aesthetic system + 4 個 Phase A 修正 + Phase B 兩個 page (Play screen + Memory Journal)
4. 你 browser 開新 HTML 睇 · approve 或者 request changes
5. Approve 之後再行 Phase C
