-- Migration 0060 · Consistency · cumulative running summary (Claude-compact shape)
-- =========================================================================
-- Replaces the per-block + relevance-retrieved rolling summaries with ONE
-- cumulative "story so far" summary per playthrough, always fully present in
-- the Narrator context (like Claude's conversation compaction). Each compact
-- regenerates it from (previous running_summary + the new raw turns since).
--
--   running_summary          — the single cumulative prose digest (NULL until first compact)
--   running_summary_through  — exclusive upper turn_index covered: turns [0, through) are in it
--
-- The old memory_summaries table + match_memory_summaries RPC become unused
-- (left in place for now · RAG-over-turns + lorebook remain the deep backstop).
--
-- REQUIRES: 0001 (playthroughs)
-- =========================================================================

alter table public.playthroughs
  add column if not exists running_summary text,
  add column if not exists running_summary_through integer not null default 0;

-- =========================================================================
-- SANITY · run after apply
-- =========================================================================
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name='playthroughs'
--     and column_name in ('running_summary','running_summary_through');
-- =========================================================================
