# Prompt for Claude Design — Story Engine UI

> Copy ✂️ 之間嘅嘢俾 Claude Design (或者任何 design agent)。

---

## ✂️ COPY FROM HERE ✂️

You are working on **Story Engine** — a 繁中 interactive fiction RPG webapp targeting HK + TW markets. The product is function-complete (backend + minimal engineering-default UI shipped to production at https://story-engine-drab.vercel.app). I need you to take over the visual direction and design the player-facing UI.

**Step 0 — Read these files first**:
- `UI_DESIGN_BRIEF.md` (project root) — product description · backend functions available · 8 pages that need design · functional hard rules · existing file references
- `CLAUDE.md` (project root) — product soul + decisions locked
- `pm/STATUS.md` — what's shipped
- `pm/BACKLOG.md` — sections「Phase 5 deferred polish」+「Phase 6 + 1.5/2 polish deferred」list UI items audit team flagged · address them in your design
- Existing UI code: `web/src/app/[locale]/library/page.tsx` · `web/src/components/play/play-client.tsx` · `web/src/components/play/DynamicStatePanel.tsx` · `web/src/components/settings/adult-mode-toggle.tsx` · `web/messages/zh-Hant.json`

**Your job**:
Visual direction · IA · interaction design · motion · responsive · tone of copy · everything visual + experiential. You decide colors / typography / layout / atmosphere / what reference points to draw from / how the brand feels. The brief tells you WHAT the product does and WHAT pages need to exist — not how they should look.

**Pages to design** (per brief section 3):
A. Library
B. Story detail
C. Play screen
D. Memory Journal (NEW · per playthrough)
E. Story creation wizard
F. Settings
G. Login / Auth
H. Locale switcher (cross-cutting)

**Suggested phasing** (you can adjust if you want):
- **Phase A** — Library + Story detail (highest priority · launch impression for visitors)
- **Phase B** — Play screen + Memory Journal (player session experience · Memory Journal is the product moat per brief)
- **Phase C** — Creation wizard + Settings + Login + Locale switcher

Pause after each phase for user review.

**Hard rules you MUST follow** (functional / legal / security / product · NOT style — see brief section 4):
1. 繁中 default · zh-Hans + EN i18n-ready (all strings as keys · no hard-code)
2. CSAM hard-rule reminder always visible in Adult mode UI regardless of toggle state (legal)
3. NSFW model + Adult content_rating filter reflect adult_mode_enabled (security · server enforces · UI mirror)
4. Director rejection rendered in-fiction as NPC pushback · never system error message
5. Skill check failure permanent · no same-turn retry button
6. 4-axis NPC disposition (trust / romance / respect / fear) must be visible in play screen
7. Memory Journal must surface 4-layer memory backend (at minimum summaries + lorebook)
8. Every page must have empty / loading / error states designed · not just happy path
9. Mobile + desktop responsive · 360px minimum width
10. 「Adult」content_rating creation button disabled unless adult_mode_enabled · with UI hint + deep link to Settings

**Address audit-deferred UI items**:
`pm/BACKLOG.md` has a list of UI items previous audit cycles flagged (e.g., P6-UX-L-03 friendly 403 card · P6-LOW-03 ModelPicker discoverability · P1.5P-LOW-01 4-axis surface · W2.6-LIB-L-05 search hint copy · etc). When you design the relevant page, your design notes should reference which audit IDs that page addresses.

**Deliverable format** (you choose · suggestion only):
- HTML mockups (Tailwind v4 CDN OK · standalone files at project root e.g. `design-mockup-library.html`) — easy for user to browser-review
- Markdown design notes per page (atoms · motion · empty/loading/error matrix · i18n key list · audit IDs addressed)
- Component / atom library spec (what reusable pieces · where they appear)

**Tech stack constraint** (your mockups must be implementable in this stack):
- Next.js 16 + Tailwind v4 + shadcn/ui + Framer Motion + next-intl
- Designer does NOT write React · engineer (future Claude session) implements

**What's OUT of scope** (don't touch):
- Backend / RPC / migration / API endpoint design
- LLM prompt engineering
- Credits / Stripe / KYC mechanics
- Phase 7 official story content writing
- Authentication mechanics
- Writing React components
- Filling i18n message JSON values (key list only)

**Communication style with user**:
- 繁中 dominant (中英夾雜 OK for technical terms)
- User is creative business partner · vibe coder · no tech background — frame design decisions in product / experience language not in component-library / framework jargon
- Brief check-ins · NOT exhaustive design dumps

**Start now**:
Read the brief + CLAUDE.md + linked files. Then begin Phase A. Pause for user review before Phase B.

## ✂️ COPY TO HERE ✂️

---

## 用法

1. 開新 Claude session (新 Claude Code instance 或者其他 Claude 介面)
2. Copy ✂️ 之間嘅嘢落去
3. Designer 自己 read brief + 出 Phase A mockup
4. 你 browser 開 mockup 睇 · approve 或者 request changes
5. Approve 後叫佢 proceed Phase B · 同樣流程
6. 三 phase 全部 approve 後 → 開 engineer Claude session implement 落 React
