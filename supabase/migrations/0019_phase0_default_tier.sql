-- Migration 0019 · Session 10 Phase 0 · tier abstraction
-- =========================================================================
-- Adds `profiles.default_tier` column (replaces `default_model` selection
-- with user-facing tier · Standard / Pro / Pro Max / Adult). The actual
-- underlying model is picked by lib/ai/tier-router.ts based on context.
--
-- Founder rule (2026-05-25): "我哋冇必要畀咁多公司 LLM 用家去選擇 ·
-- just change it to something like standard, pro to let user to choose"
--
-- BACKWARDS COMPAT: keeps `default_model` column (used by Settings page
-- legacy path + Phase 6 NSFW reset logic). NEW playthroughs honor
-- `default_tier`; existing playthroughs continue with their locked model.
-- =========================================================================

alter table public.profiles
  add column if not exists default_tier text
    check (default_tier in ('standard', 'pro', 'pro-max', 'adult'));

comment on column public.profiles.default_tier is
  'User-facing model tier picked by user. lib/ai/tier-router.ts picks the actual underlying LLM (Standard pool · Pro pool · etc.) at turn time. NULL = use DEFAULT_TIER constant.';

-- Backfill existing users from their previous default_model.
--   - Sonnet 4.6 / Opus 4.7 / GPT-4o / GPT-5.4 Pro / Gemini 3.1 Pro → 'pro'
--   - Gemini 3.5 Flash / GLM-5.1 / GPT-4o mini / Grok 2 Mini → 'standard'
--   - Llama 405B → 'adult' (only NSFW route)
--   - NULL or unknown → 'pro' (matches old DEFAULT_NARRATOR = Sonnet)
update public.profiles
set default_tier = case
  when default_model in (
    'claude-sonnet-4-6',
    'claude-opus-4-7',
    'gpt-4o',
    'gpt-5-4-pro',
    'gemini-3-1-pro',
    'grok-2'
  ) then 'pro'
  when default_model = 'claude-opus-4-7' then 'pro-max'
  when default_model in (
    'gemini-3-5-flash',
    'glm-5-1',
    'gpt-4o-mini',
    'grok-2-mini'
  ) then 'standard'
  when default_model = 'llama-3-1-405b-uncensored' then 'adult'
  else 'pro'  -- safe fallback for NULL or unknown
end
where default_tier is null;

-- =========================================================================
-- Sanity (run as separate query after migration in dashboard):
--   select default_tier, count(*) from public.profiles group by default_tier;
-- =========================================================================
