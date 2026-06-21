-- 0070 · Walk-on experiences (ADR-007 Stage 1b · character depth = emergent)
--
-- Lets a NAMED walk-on (in the playthrough's mention roster, but with NO
-- story_characters row) accrue an experience log of its own, so a player who
-- keeps engaging with a walk-on sees them deepen — organically, no count gate.
--
-- WHY name-keyed (not a story_characters row): story_characters is STORY-scoped
-- (shared across all playthroughs of a story) and its rows are Zod-parsed into
-- full cast cards on every turn. Promoting a walk-on there would (a) leak one
-- player's emergent character to every player, and (b) need a valid full card.
-- Instead, walk-on experiences live per-playthrough keyed by NAME — isolated to
-- the experience system, zero change to the critical cast-load / RLS path.
--
-- A row now identifies its subject by EITHER a cast character_id OR a walk-on
-- character_name. The existing RLS (char_exp_own_select · playthrough-scoped)
-- already covers these rows unchanged.

alter table public.character_experiences
  alter column character_id drop not null;

alter table public.character_experiences
  add column if not exists character_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'char_exp_subject_present'
  ) then
    alter table public.character_experiences
      add constraint char_exp_subject_present
      check (character_id is not null or character_name is not null);
  end if;
end $$;

create index if not exists char_exp_pt_name_idx
  on public.character_experiences (playthrough_id, character_name)
  where character_name is not null;
