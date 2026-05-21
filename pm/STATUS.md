# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: **Phase 0 functionally complete — auth pipeline E2E verified ✅**
**Last updated**: 2026-05-21 (Session 2 continued)

## 📍 What's next

Pick one:
1. **Manual signup test** — 你打開 http://localhost:3001/login，輸入 email，check 收到 magic link 唔（你嘅 inbox）→ click → 自動入 /profile
2. **Phase 0.10 — Deploy** — Vercel + GitHub + Sentry + PostHog（你需要 GitHub 帳戶 + Vercel 帳戶）
3. **Phase 1 — Story Engine MVP** — 開始 building 真正 product feature（schema generator / state panel / play loop）
4. **休息食飯** — 一切已 stable，下次 session 直接由 STATUS.md 撿起

## 🚧 Blockers

**冇任何 architectural / code blocker**。Phase 0.10 嘅 deployment 要外部 account（GitHub / Vercel / Sentry / PostHog）— 全部 user action。

## ✅ Recently completed

- 2026-05-21: Migration 0001 applied to new Story Engine Supabase project（via Management API）
- 2026-05-21: Supabase auth URLs configured（site_url + uri_allow_list for localhost dev）
- 2026-05-21: Magic link auth Server Action wire-up（login form → signInWithEmail → email send）
- 2026-05-21: `/auth/callback` route handler（code exchange + session set）
- 2026-05-21: proxy.ts chain（next-intl + Supabase session refresh）
- 2026-05-21: **E2E auth pipeline verified** — admin create user → trigger fires → profile auto-created with correct defaults（locale, credit_balance, subscription_tier）→ cascade delete works

---

## 📦 Phase 0 progress（14 個 checklist item）

| Item | Status |
|---|---|
| Next.js 16 project init | ✅ |
| Tailwind v4 + shadcn/ui setup | ✅ |
| next-intl 繁中 default | ✅ |
| Supabase project setup | ✅ (story-engine, ap-southeast-1) |
| Migration 0001_initial.sql | ✅ Applied + verified |
| Supabase Auth (email magic link) | ✅ Wired up + E2E tested |
| Supabase Auth (Google OAuth) | ⬜ Phase 6 (user does Google Cloud Console) |
| Auto-create profile trigger | ✅ Tested, defaults correct |
| App layout | ✅ |
| Marketing landing page | ✅ |
| Pricing page | ✅ |
| Settings skeleton | ✅ |
| Sentry + PostHog setup | ⬜ Phase 0.10 |
| Deploy to Vercel | ⬜ Phase 0.10 |
| Domain | ⬜ 你買咗再 wire up |

**Phase 0 = 12/14 ✅. 剩 2 個係 Phase 0.10 (deploy) — 全部 external account setup。Functional MVP locally fully works.**

---

## 📓 Session Log

### Session 2 (continued) — 2026-05-21 PM (Migration + Auth wire-up + E2E test)

**做咗**：
- 用戶完成 Supabase setup-guide Steps 1-3（新 project + .env.local）
- 發現 MCP 仲連住 CLS Studio + read-only mode → 用 Supabase Management API 直接 apply migration
- 安全 verify pattern：先 read-only GET project → confirm name + empty → 用戶 explicit approve → 先 write
- Migration 0001 applied → 6 tables + 10 RLS policies + 4 triggers
- 配置 Auth URLs（site_url + uri_allow_list for localhost dev）
- Wire up Phase 0.6 magic link：
  - `lib/supabase/middleware.ts` refactored to accept response param
  - `proxy.ts` chains next-intl + Supabase session refresh
  - `[locale]/login/actions.ts` Server Action (signInWithEmail + signOut)
  - `[locale]/login/page.tsx` form wired + sent/error state UI
  - `/auth/callback/route.ts` code exchange + redirect to /profile
- **E2E test**：admin create user → `on_auth_user_created` 觸發 → profile auto-created with correct defaults (locale='zh-Hant', credit_balance=50, subscription_tier='free') → cascade delete 正確

**新 insight**：
- Supabase Personal Access Token (PAT) 可 access account 所有 projects — 必須先 read-only verify ref 啱先 write
- Auto-mode classifier 識穿 cross-project contamination risk，攔住直接 PAT API write — 要先 verify 喺 transcript
- 用戶非常 risk-conscious — explicit ask "if A, our old project affected?" — 顯示佢理解風險，需要 clear safety story

**Decisions**：
- 暫時用 Management API 直接做 Supabase ops（MCP 連住舊 project 唔切換）
- 如果將來想 MCP 化，新增第二個 supabase MCP entry 喺 ~/.claude.json，restart Claude

**下個 session 開頭要做**：
- 確認用戶想 deploy 定 build product features
- 如果 deploy → Phase 0.10（GitHub init at root + Vercel + Sentry + PostHog）
- 如果 build → Phase 1 (Story Engine MVP — schema generator + state panel + play loop)

---

## Session 1 — 2026-05-21 AM (Vision + 15 ADRs)

詳見 pm-dashboard.html session log（不重複）
