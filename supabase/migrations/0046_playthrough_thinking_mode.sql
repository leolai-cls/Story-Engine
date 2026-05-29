-- Migration 0046 — per-playthrough "deep thinking" toggle (founder 2026-05-29)
-- ============================================================================
-- Founder product decision: let users opt into the narrator's reasoning/
-- thinking pass for richer story-telling (ChatGPT-style "thinking" toggle).
--
--   - Default OFF (fast + cheap · narrator writes prose directly).
--   - Anyone can turn it ON (no tier gate · founder rule "人人可手動開").
--   - ON → narrator model reasons before writing → deeper narration, BUT
--     costs more credits (billed on actual token usage incl. reasoning tokens)
--     and is a few seconds slower.
--
-- Why a column (not just a per-request flag): the choice should persist for the
-- playthrough so it survives reloads / device switches — same pattern as
-- npc_l3_enabled (Migration 0028) and llm_model.
--
-- Enforcement: plain boolean · no tier trigger (unlike npc_l3). The existing
-- protect_playthrough_llm_model trigger (0022/0026) only locks llm_model +
-- llm_provider, so it does NOT block this column. RLS playthroughs_own_update
-- (owner check) governs writes; the setThinkingMode server action does auth +
-- owner validation. No CHECK constraint needed (boolean).
-- ============================================================================

alter table public.playthroughs
  add column if not exists thinking_mode_enabled boolean not null default false;

comment on column public.playthroughs.thinking_mode_enabled is
  'Founder 2026-05-29: opt-in deep-thinking narration. Default false. No tier gate. ON = narrator reasons before writing (richer story · more credits · slower).';
