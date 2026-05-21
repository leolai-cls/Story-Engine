# Story Engine

> 中文圈嘅互動式故事 RPG 平台 — AI 為你度身設計故事，永遠記得你嘅選擇，NPC 真有人格、唔會討好你。

## Quick links (open in browser)

| File | Purpose |
|---|---|
| `plan.html` | Business-friendly 完整 product plan |
| `pm-dashboard.html` | Project status / roadmap / decisions / open questions |
| `setup-guide.html` | New developer Supabase + Vercel setup walkthrough |
| `audit-report.html` | Latest code audit findings |

## Repo structure

```
text based RPG/
├── CLAUDE.md          # Project soul (auto-loaded by Claude Code)
├── *.html             # Human-facing dashboards
├── pm/                # PM artifacts (STATUS, ROADMAP, DECISIONS, BACKLOG, OPEN_QUESTIONS, GLOSSARY)
├── supabase/          # Supabase config + migrations
│   ├── config.toml
│   └── migrations/
│       └── 0001_initial.sql
└── web/               # Next.js 16 app (Vercel deploys from here)
    ├── package.json
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── lib/supabase/
    │   ├── i18n/
    │   └── proxy.ts
    ├── messages/      # next-intl translations (zh-Hant default + zh-Hans + en)
    └── .env.example
```

## Local development

```bash
cd web
npm install
cp .env.example .env.local      # fill in Supabase + others
npm run dev                     # http://localhost:3000
```

## Tech stack (locked, see DECISIONS.md)

- **Frontend / Backend**: Next.js 16 (App Router) + React 19 + TypeScript
- **UI**: Tailwind v4 + shadcn/ui + Framer Motion
- **DB / Auth / Storage**: Supabase (Postgres + pgvector + auth + edge functions)
- **LLM abstraction**: Vercel AI SDK (Claude / GPT / Gemini / Grok / OpenRouter)
- **Embeddings**: OpenAI text-embedding-3-small
- **Payments**: Stripe (subscriptions + top-ups)
- **i18n**: next-intl, 繁中 default + 簡中 + 英

## Phase status

Currently **Phase 0 functionally complete (12/14 ✅)** — see `pm-dashboard.html` for live status.

8-phase roadmap: 0 地基 → 1 故事引擎 → 1.5 故事完整性 → 2 長期記憶 → 3 多 Model+Credits → 4 訂閱付費 → 5 社群 → 6 成人模式 → 7 上線打磨。

## License

Proprietary — all rights reserved.
