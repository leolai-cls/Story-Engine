-- Migration 0020 · Session 10 Phase 0 · RAG similarity floor cleanup
-- =========================================================================
-- HISTORY:
--   I (Claude) initially wrote this migration to ADD similarity floors per
--   CLAUDE.md hard rule #18, NOT realizing the project had ALREADY shipped
--   the floor implementation as a runtime parameter (p_min_similarity).
--
--   Existing RPCs accept p_min_similarity (defaults 0.0 · caller passes 0.55
--   summaries / 0.5 RAG turns / 0.45 lorebook from retriever.ts cfg constants
--   per CLAUDE.md #18). Plus HNSW overprovision (5× candidate fetch) for
--   correct top-K after exclusion filtering.
--
--   My initial CREATE OR REPLACE used the OLD 3/3/4-arg signature without
--   p_min_similarity, which Postgres treats as a NEW overload (different
--   param count), creating ghost RPCs. Same pattern as P6P2-DB-M-01
--   (Migration 0017 fork RPC overload drop).
--
-- THIS MIGRATION: drops the ghost 3/3/4-arg versions I accidentally created,
-- restoring single-signature RPCs that match retriever.ts callers.
-- =========================================================================

drop function if exists public.match_turn_embeddings(uuid, extensions.vector, integer, integer[]);
drop function if exists public.match_memory_summaries(uuid, extensions.vector, integer);
drop function if exists public.match_lorebook_entries(uuid, extensions.vector, integer);

-- =========================================================================
-- Sanity (run as separate query after apply):
--   select proname, pronargs, pg_get_function_identity_arguments(oid)
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('match_turn_embeddings', 'match_memory_summaries', 'match_lorebook_entries');
--
-- Expected: 3 rows. Each RPC has exactly 1 version · all include p_min_similarity.
-- =========================================================================
