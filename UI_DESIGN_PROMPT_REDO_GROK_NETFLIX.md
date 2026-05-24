# Prompt for Claude Design — Full Phase A/B/C visual redo (Grok + Netflix) + 6 Phase C corrections

> Copy ✂️ 之間嘅嘢俾 Claude Design。

---

## ✂️ COPY FROM HERE ✂️

The Phase A/B/C mockups all landed functionally — story-as-scenario model correctly framed, 4-axis disposition surfaced, skill check permanent with all 4 outcomes, Director rejection rendered in-fiction, Memory Journal 3 tabs + 4-layer mapped, adult mode 3-state correctly modeled, audit-deferred items addressed. The LOGIC is right.

But the VISUAL DIRECTION isn't landing. The current Phase A/B/C aesthetic reads as「default Tailwind + shadcn AI-design-tool output」— generic, cardboard, AI-built. We want this to feel like a **real product** with a strong opinion, not a hosted Claude-Design preview.

Two things to do in parallel:

1. **Full visual redo** of Phase A + B + C — new direction: **Grok (xAI chat product) × Netflix (homepage browsing)**, light theme. Same functional structure, same backend alignment, same hard rules. Pure visual / IA / typography / motion / atmospheric overhaul.
2. **Address 6 Phase C logical issues** in the redo (don't re-introduce them).

---

## 1. New visual direction — Grok × Netflix · light theme

### Why these references

- **Grok (grok.com / x.ai)** — the LLM-app vibe done right: precise typography, mono chrome for technical labels, dense-but-breathable layout, stat-forward, glassmorphic surfaces where they earn it, brand-bold without being corporate. Strong opinions about typography hierarchy. Anti-shadcn-default look.
- **Netflix homepage** — cinematic browsing: hero takeover with auto-cycling featured content, horizontal genre rows, cover-dominant cards (covers ARE the content, not labels with cover thumbnails), hover preview, edge-to-edge scroll cadence,「continue watching」pinned, infinite-scroll feel.

We're light-theme (founder pick) so the Netflix dark-paper aesthetic needs translation — but the **density · cover-dominance · scroll cadence · hero takeover** patterns all apply. Think Apple TV+ light browsing surfaces, or Spotify Wrapped's light variants, or modern A24 / Criterion-streaming-style light cinematic.

### How the references apply per page

| Page | DNA | What changes |
|---|---|---|
| **Library** | 90% Netflix · 10% Grok | Cinematic hero (auto-cycling featured story · large cover image takeover · CTA dominant) · horizontal rows w/ stronger scroll cadence · covers DOMINATE cards (current cards are mostly text · should be mostly cover) · `Continue Playing` pinned + hero-styled · hover-preview-like interaction (card scales subtly · maybe play opening sentence on hover) · row titles in mono chrome (Grok) `🔥 熱門 · TRENDING NOW` |
| **Story detail** | 70% Netflix · 30% Grok | Hero takeover with full-bleed cover gradient · title overlaid · CTA cluster dominant · scroll-down reveals scenario landing meta (cast · opening preview · stats · comments) · stats sidebar in Grok mono chrome |
| **Play screen** | 100% Grok | This is the LLM-app surface. Book-reading typography for narrative (current is OK but could go further — bigger leading, longer measure, better CJK font feel). Right rail with NPC dispositions + state panel = stat-forward Grok dashboard with mono labels everywhere. Action input = chat-input feel with mono character count + cost. Skill check + Director moments = Grok-style modal overlays with strong type hierarchy. |
| **Memory Journal** | 100% Grok | Already heading this way. Lean harder: technical readout aesthetic, similarity scores prominent, mono FROM-TURN labels, layer counters prominent, more dashboard-density. The 「killer demo」 of「proof AI 真係記得」should feel like inspecting an LLM's working memory · not reading a wiki. |
| **Creation wizard** | 80% Grok · 20% Netflix | Grok form precision · mono field labels · taut spacing. Generation progress screen = peak Grok dashboard moment (4 parallel tasks · live status · mono timing · token counters maybe). |
| **Settings / Login / Locale** | 100% Grok | Clean technical surfaces · mono labels · table-density rows · stronger keyboard navigation cues. |

### Hard visual rules to break the「AI-generated」feel

- **NO shadcn-default look** — no muted-everything cards with generic shadow. Surfaces need character.
- **NO uniform 12-14px font everything** — strong typography hierarchy. Hero headlines large (40-64px). Body around 15-16. Mono labels around 10-11.
- **Cover images BIG** — Library cards should be 3:4 ratio with cover taking 80%+ of card visual weight. Currently text-heavy cards · designer should flip ratio.
- **Mono everywhere technical** — turn numbers, model ids, credit costs, similarity scores, timestamps, status codes. Always mono. Always small. Always letterspaced.
- **Real photography on covers OR designed gradient placeholders** — currently the striped placeholder works but could be richer (e.g., genre-coded gradient with overlaid type · A24 poster aesthetic).
- **Motion has purpose** — entrance / hover / state-change · all motion ≤400ms · cubic-bezier(.2, .7, .3, 1) · no bouncy spring.
- **Light theme but NOT flat** — surfaces have depth (subtle elevation · 1px borders · purposeful shadows). Avoid「everything looks the same off-white」trap.
- **Don't fear empty space** — current layouts feel cramped. Generous gutters. Netflix breathes.
- **One bold accent** — keep violet but use it sparingly · 2-3 places per screen max. Not decorative.

### Brand vibe to chase

This is **the platform that makes 中文圈 fall in love with AI fiction RPG**. It should feel:
- Confident · opinionated · cinematic
- Like a product made by people who actually love stories, not a generic SaaS chrome wrapper
- Like Grok-meets-A24-streaming-service
- Like NovelAI if NovelAI hired a real design lead

NOT:
- Like a Tailwind UI template
- Like another shadcn dashboard
- Like a「modern」startup landing page

---

## 2. Six Phase C corrections (must fix in redo · NOT re-introduce)

### 2.1 ❌ Drop「儲存草稿」button (`creation.jsx:311`)

Backend has NO draft system. Story creation is atomic across 4 LLM calls — either all 4 succeed and the story commits, or nothing saves.「儲存草稿」implied partial save which we don't support.

**Action**: Remove the button entirely. If you want a「save for later」affordance, defer to v1.5+ and tag it explicitly.

### 2.2 ❌ Drop「預覽」button (`creation.jsx:313`)

Backend has NO preview API. The 4 LLM calls ARE the generation · there's no cheap dry-run.「預覽」suggests a feature that doesn't exist.

**Action**: Remove the button. Submit CTA is the only path forward.

### 2.3 ❌ Login Guest「link 返 email 保存晒所有 playthrough」copy (`settings-login.jsx:482`)

Backend doesn't have anonymous-to-permanent account upgrade wired. Supabase `auth.linkIdentity()` API exists, but our app hasn't built the migration flow. Right now anonymous Guest = separate user with separate UUID · if user later signs up with email, those two accounts don't merge.

**Action**: Change copy to be honest. Suggestion:
> 「Guest 模式 · 即時試玩 · 想長期保存就 sign up 用 email」

Or skip the future-promise entirely.

### 2.4 ⚠️ Per-task model labels in Generation progress (`creation.jsx:324-329`)

Backend `web/src/lib/ai/schema-generator.ts:39` hardcodes `const MODEL = "claude-sonnet-4-6"` for all 4 parallel calls. The current mockup labels (`haiku-4.5` for state_schema) don't match.

**Action**: Either (a) all 4 labels show `sonnet-4.6` to match backend, OR (b) leave a single「~50 秒 · 4 task 並行」line and drop per-task model labels entirely (cleaner UI · sidesteps the inaccuracy).

Side note: your postit「server source-of-truth」flag was right · engineer should expose this via SSE event payload eventually.

### 2.5 💡「成人」KYC jargon in wizard tooltip (`creation.jsx:111`)

Tooltip says「需要喺 設定 → 成人模式 開啟（KYC）」— uses「KYC」which is industry jargon. P6-LOW-02 backlog issue not propagated from Phase B to Phase C wizard.

**Action**: Change to「需要喺 設定 開啟成人模式」+ keep deep-link.

### 2.6 💡「Phase 6」on data export button (`settings-login.jsx:377`)

「匯出（Phase 6）」disabled button — but Phase 6 is adult mode non-money (already shipped) · NOT data export. Data export is more like v1.5+.

**Action**: Change to「（v1.5+）」or「（將來支援）」.

### 2.7 Misc text consistency

- `creation.jsx:297`「4 個 model 並行」→「4 個並行 task」(same model, different tasks).
- Postit references `kyc_verified_at` — backend column is actually `is_age_verified`. (Cosmetic · engineer will reconcile during implementation.)

---

## 3. Deliverable format

Same as before:

- New HTML mockup files per phase (`phase-a-library-story.html` · `phase-b-play-memory.html` · `phase-c-creation-settings-login-locale.html`) — Tailwind v4 CDN + plain HTML so user can browser-review.
- Updated JSX mockup files (or rewritten if structure changes substantially).
- Updated `tokens.css` — adjust palette / typography / spacing tokens to reflect the new direction (still light · still i18n CJK-aware · same token NAMES so engineer cutover is clean).
- New postit notes per artboard — what design moves changed and why · backend deps · hard rules covered · audit IDs addressed.
- Mobile + desktop breakpoints per page.
- Empty / loading / error states matrix per page (don't lose these — they're production-critical).

Pause for user review per phase. Phase A redo first (Library + Story detail — highest visual impact for launch). Review. Then Phase B (Play + Memory Journal). Review. Then Phase C (Creation + Settings + Login + Locale).

---

## 4. What MUST NOT change

Functional / product / backend alignment is locked:

1. Story = scenario template · NOT fixed novel. No completion %, no chapter system, no fixed length expectations.
2. Memory is **per-playthrough · 100% read-only · user cannot mutate**. Header reinforces, no edit affordance.
3. 4-axis disposition (trust / romance / respect / fear) MUST be visible in play screen (Hard #6).
4. Skill check failure PERMANENT · no same-turn retry · all 4 outcomes designed (Hard #5).
5. Director rejection rendered in-fiction · no system-jargon labels (Hard #4).
6. CSAM hard-rule reminder ALWAYS visible in adult mode UI (Hard #2).
7. NSFW model + adult content_rating filter reflect `adult_mode_enabled` (Hard #3 / #10).
8. Memory Journal MUST surface 4-layer backend (Hard #7).
9. Empty / loading / error states every page (Hard #8).
10. Mobile + desktop responsive · 360px minimum (Hard #9).
11. 繁中 default · zh-Hans + EN i18n-ready · no hard-coded strings.

The 6 Phase C corrections (section 2) ALSO are non-negotiable in the redo — they're product accuracy fixes.

---

## 5. Anti-patterns to avoid (the「AI-generated」smell)

- Generic shadcn cards with muted borders + muted text + muted shadows everywhere
- Uniform 12-14px sans-serif everything (no hierarchy)
- Centered hero headline + centered subtext + centered CTA · centered everything (Netflix is left-aligned · Grok is left-aligned)
- Floating「toggle」controls everywhere (Linear / shadcn defaults)
- Generic empty-state illustrations (a sad cloud · a magnifying glass · etc) — use real product copy instead
- Inline tags with bg-{color}-50 text-{color}-700 pills for everything
- Three-column equal-grid layouts for content (Netflix uses 1 column hero + horizontal rows · not grids)
- Tag clouds, footer link forests, table-of-contents sidebars on simple pages
- Decorative gradients (gradients must communicate something — genre · accent · state)

---

## 6. Quick reality-check questions to answer for yourself before drawing

- Does the Library page make a Mainland visitor immediately want to start playing? Or does it look like another web app?
- Does the Play screen make me forget I'm in a UI · or am I aware of buttons / labels / chrome the whole time?
- Does the Memory Journal feel like inspecting AI's brain · or like reading another wiki?
- Does the Story detail page make the premise feel cinematic · or does it feel like a Wattpad product card?
- Does Settings feel like a thoughtful tool · or like a Tailwind admin dashboard?

If any answer is「the latter」· the direction needs another pass.

---

Start with Phase A redo. Read the existing v4 (`library.jsx` · `story-detail.jsx`) for the logical structure that must be preserved, then redesign the visual layer ground-up. Pause for user review before Phase B.

## ✂️ COPY TO HERE ✂️

---

## 用法

1. Continue 現有 Claude Design conversation 或者開新 session
2. Copy ✂️ 之間嘅嘢落去
3. Designer 出 Phase A redo (Library + Story detail) · 暫停等你 browser-review
4. Approve 後 → Phase B redo (Play + Memory Journal) · review
5. Approve 後 → Phase C redo (Creation + Settings + Login + Locale) · review
6. 三 phase 全部 approve 後 → engineering session implement 落 React

## Phase 後嘅 engineering plan (FYI · 唔需要 hand 俾 designer)

當 3 phase visual design approve 完之後 · engineering session 會：

1. Update `tokens.css` 落 actual `web/src/app/globals.css`
2. Component-by-component port HTML mockups → React + shadcn (where shadcn primitives fit · custom where designer overruled shadcn defaults)
3. Wire 落 existing backend endpoints (turn route · memory journal API · settings actions · etc)
4. i18n key extraction → `web/messages/zh-Hant.json` (+ zh-Hans + EN stubs)
5. Memory journal API endpoint build (`/api/playthroughs/[id]/memory-journal`)
6. Per-task SSE event stream for creation progress (optional polish · indeterminate spinner OK fallback)
7. estimate_creation_cost RPC if cost preview wanted
8. Lock anonymous-to-permanent upgrade flow (or keep copy honest per #2.3)
9. State_schema generation cost optimization — switch to Haiku ($-savings) per #2.4
10. Pixel-pass + interaction audit before launch

~2-3 engineering sessions for full UI implementation depending on how custom the visual direction goes.
