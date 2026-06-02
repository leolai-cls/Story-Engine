-- 0057 · Session 17 (2026-06-02) · light-core pivot
-- Backfill EXISTING non-adult playthroughs from the retired CrazyRouter narrators
-- to Claude-direct, so old stories get the same real-streaming / Sonnet-Opus quality
-- as new ones (the tier-router only affects NEW playthroughs; narrator model is
-- locked per-playthrough in playthroughs.llm_model).
--
-- Mapping:
--   gemini-3-5-flash / deepseek-v3-2 / glm-5-1  (old Standard) -> claude-sonnet-4-6
--   gpt-5-4-pro                                  (old Pro EN)   -> claude-opus-4-7
--
-- SAFETY:
--   * ADULT playthroughs are LEFT UNTOUCHED — `content_rating = 'adult'` is excluded,
--     so Grok-4-1 (and any glm-5-1 on an adult story) stay put. NSFW must never route
--     to Anthropic (CLAUDE.md hard rule #5).
--   * claude-sonnet-4-6 rows are LEFT UNTOUCHED on purpose: post-pivot that id is shared
--     by old-Pro-Sonnet AND new-Standard-Sonnet playthroughs, so we cannot safely bump
--     old-Pro ones to Opus without also hitting new-Standard ones. Old-Pro-Sonnet keeps
--     Sonnet (a fine non-adult narrator) — no breakage.
--   * Idempotent: only matches the four retired ids, which no NEW playthrough uses, so
--     re-running is a no-op.
--   * All target ids (claude-sonnet-4-6 / claude-opus-4-7) exist in MODELS + MODEL_PRICING
--     (avoids the two-catalog 500 bug class).

update public.playthroughs pt
set llm_model = case
    when pt.llm_model = 'gpt-5-4-pro' then 'claude-opus-4-7'   -- old Pro (EN) narrator
    else 'claude-sonnet-4-6'                                   -- old Standard narrators
  end
from public.stories s
where s.id = pt.story_id
  and s.content_rating is distinct from 'adult'
  and pt.llm_model in ('gemini-3-5-flash', 'deepseek-v3-2', 'glm-5-1', 'gpt-5-4-pro');
