-- Migration 0021 · Phase 0 audit fix · Opus backfill CASE order bug
-- =========================================================================
-- AUDIT FIX P0A-HIGH-01 / P0B-HIGH-01:
--   Migration 0019 CASE clause had 'claude-opus-4-7' in BOTH the IN-list
--   that returns 'pro' AND a later dedicated 'pro-max' branch. SQL CASE
--   evaluates top-down · so Opus users hit the first match → 'pro' ·
--   never reaching the 'pro-max' branch.
--
-- ACTUAL IMPACT TODAY: 0 users (verified via SQL: SELECT count(*) FROM
-- profiles WHERE default_model='claude-opus-4-7' returned empty).
--
-- LATENT IMPACT: defensive fix · if migration re-runs OR future backfill
-- re-introduces the bug, Opus users would be silently downgraded to Pro
-- pool · losing access to Opus 4.7 narrator (Pro Max tier benefit).
--
-- This migration is idempotent · re-routes any Opus users wrongly placed
-- in 'pro' back to 'pro-max'. Safe to run multiple times.
-- =========================================================================

update public.profiles
set default_tier = 'pro-max'
where default_model = 'claude-opus-4-7'
  and default_tier = 'pro';

-- =========================================================================
-- Sanity:
--   select default_model, default_tier, count(*)
--   from profiles
--   where default_model = 'claude-opus-4-7'
--   group by default_model, default_tier;
--
-- Expected: 0 rows with default_tier='pro' · all Opus users in 'pro-max'.
-- =========================================================================
