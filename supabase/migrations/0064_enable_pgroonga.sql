-- 0064 · Enable PGroonga (CJK-capable full-text search · Session 19 2026-06-12)
-- Why: Postgres 內建 FTS 對中文壞 (whitespace tokenize · hard rule #25)。PGroonga
-- 原生支援中日文。呢步只開 extension — 唔起任何 index、唔改任何行為。
-- 接線 (memory retriever hybrid search + library story search) 留第 2 波 M2。
-- Applied to prod via Supabase MCP 2026-06-12 (same session).
create extension if not exists pgroonga with schema extensions;
