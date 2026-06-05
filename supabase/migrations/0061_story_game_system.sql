-- Migration 0061 · Deep Mode ②③ · per-story game_system declaration (the 「藍圖」)
-- =========================================================================
-- Story creation now declares this story's mechanics (the 05-game-system.md
-- blueprint): narrative / dice / combat / capture / mixed, the skill stat keys
-- to roll against (subset of the state_schema's numeric fields), and the opening
-- objectives (quest lines). Runtime-agnostic declaration — consumed by the dice
-- trigger (②) + quest tracking (③) once those land.
--
-- nullable jsonb — existing stories (no declaration) default to pure narrative
-- at read time. Shape (validated app-side by GameSystemSchema):
--   { mechanic: "narrative"|"dice"|"combat"|"capture"|"mixed",
--     objectives: string[] }
-- (skill stats for dice are derived at runtime from the state_schema's numeric
--  fields · numericSkillKeys · NOT stored here.)
--
-- REQUIRES: 0001 (stories)
-- =========================================================================

alter table public.stories
  add column if not exists game_system jsonb;

-- =========================================================================
-- SANITY · run after apply
--   select column_name, data_type from information_schema.columns
--   where table_name='stories' and column_name='game_system';
-- =========================================================================
