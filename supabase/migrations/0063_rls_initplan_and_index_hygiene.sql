-- Migration 0063 · audit perf — RLS initPlan rewrite + index hygiene
-- =========================================================================
-- From the 2026-06-08 technical architecture audit (Supabase advisor-confirmed):
--
-- (A) 40 RLS policies call auth.uid() BARE in using/with_check → Postgres
--     re-evaluates it PER ROW (auth_rls_initplan). Wrapping as
--     (select auth.uid()) evaluates ONCE per query (initPlan). Invisible at
--     current volume; a measurable per-row tax on hot tables (turns /
--     turn_embeddings / stories / ratings) as playthroughs grow. Mechanical ·
--     zero behavior change (same boolean result).
--
-- (B) 3 HNSW vector indexes are NEVER used (EXPLAIN-verified: every retrieval
--     filters playthrough_id first → planner always picks the tenant filter +
--     exact cosine sort · which is CORRECT and fast for per-tenant K).
--     They only cost insert latency + ~half the embedding storage. Drop.
--
-- (C) 5 unindexed FKs (advisor unindexed_foreign_keys) → btree them. Cheap
--     insurance for FK integrity checks + future character-keyed queries.
--
-- All statements idempotent-safe to re-run (alter policy is, drop/create index
-- use if exists / if not exists).
-- Same migration shipped via MCP apply_migration · this file is the canonical
-- record in supabase/migrations/.
-- =========================================================================

-- ── (A) RLS initPlan rewrite — definitions captured from live pg_policies ──

-- character_beliefs
alter policy char_beliefs_own_select on public.character_beliefs
  using (exists (select 1 from playthroughs p
    where p.id = character_beliefs.playthrough_id and p.user_id = (select auth.uid())));

-- character_experiences
alter policy char_exp_own_select on public.character_experiences
  using (exists (select 1 from playthroughs p
    where p.id = character_experiences.playthrough_id and p.user_id = (select auth.uid())));

-- credit_ledger
alter policy credit_ledger_own_select on public.credit_ledger
  using ((select auth.uid()) = user_id);

-- lorebook_entries
alter policy lorebook_own_select on public.lorebook_entries
  using (exists (select 1 from playthroughs p
    where p.id = lorebook_entries.playthrough_id and p.user_id = (select auth.uid())));

-- mem_edges
alter policy mem_edges_own_select on public.mem_edges
  using (exists (select 1 from playthroughs p
    where p.id = mem_edges.playthrough_id and p.user_id = (select auth.uid())));

-- memory_summaries
alter policy memory_summaries_own_select on public.memory_summaries
  using (exists (select 1 from playthroughs p
    where p.id = memory_summaries.playthrough_id and p.user_id = (select auth.uid())));

-- moderation_flags
alter policy moderation_flags_own_read on public.moderation_flags
  using ((select auth.uid()) = reporter_id);
alter policy moderation_flags_authed_insert on public.moderation_flags
  with check (((select auth.uid()) is not null) and (reporter_id = (select auth.uid())));

-- npc_inner_thoughts
alter policy npc_inner_thoughts_own_select on public.npc_inner_thoughts
  using (exists (select 1 from playthroughs p
    where p.id = npc_inner_thoughts.playthrough_id and p.user_id = (select auth.uid())));

-- playthrough_character_states
alter policy pcs_own_select on public.playthrough_character_states
  using (exists (select 1 from playthroughs p
    where p.id = playthrough_character_states.playthrough_id and p.user_id = (select auth.uid())));
alter policy pcs_own_update on public.playthrough_character_states
  using (exists (select 1 from playthroughs p
    where p.id = playthrough_character_states.playthrough_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from playthroughs p
    where p.id = playthrough_character_states.playthrough_id and p.user_id = (select auth.uid())));
alter policy pcs_own_insert on public.playthrough_character_states
  with check (exists (select 1 from playthroughs p
    where p.id = playthrough_character_states.playthrough_id and p.user_id = (select auth.uid())));

-- playthroughs
alter policy playthroughs_own_select on public.playthroughs
  using ((select auth.uid()) = user_id);
alter policy playthroughs_own_update on public.playthroughs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy playthroughs_own_delete on public.playthroughs
  using ((select auth.uid()) = user_id);
alter policy playthroughs_own_insert on public.playthroughs
  with check ((select auth.uid()) = user_id);

-- profiles
alter policy profiles_own_read on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_own_update on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy profiles_own_delete on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_own_insert on public.profiles
  with check ((select auth.uid()) = id);

-- scene_images
alter policy scene_images_own_select on public.scene_images
  using ((select auth.uid()) = user_id);

-- stories
alter policy stories_owner_select on public.stories
  using ((select auth.uid()) = owner_id);
alter policy stories_owner_update on public.stories
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
alter policy stories_owner_delete on public.stories
  using ((select auth.uid()) = owner_id);
alter policy stories_owner_insert on public.stories
  with check ((select auth.uid()) = owner_id);

-- story_characters
alter policy story_characters_read_via_story on public.story_characters
  using (exists (select 1 from stories s
    where s.id = story_characters.story_id
      and (s.owner_id = (select auth.uid()) or s.visibility = 'public'::text)));
alter policy story_characters_owner_update on public.story_characters
  using (exists (select 1 from stories s
    where s.id = story_characters.story_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from stories s
    where s.id = story_characters.story_id and s.owner_id = (select auth.uid())));
alter policy story_characters_owner_delete on public.story_characters
  using (exists (select 1 from stories s
    where s.id = story_characters.story_id and s.owner_id = (select auth.uid())));
alter policy story_characters_owner_insert on public.story_characters
  with check (exists (select 1 from stories s
    where s.id = story_characters.story_id and s.owner_id = (select auth.uid())));

-- story_comments
alter policy story_comments_public_read on public.story_comments
  using ((deleted = false) and exists (select 1 from stories s
    where s.id = story_comments.story_id
      and (s.visibility = 'public'::text or s.owner_id = (select auth.uid()))));
alter policy story_comments_own_update on public.story_comments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy story_comments_own_insert on public.story_comments
  with check (((select auth.uid()) = user_id) and (deleted = false)
    and exists (select 1 from stories s
      where s.id = story_comments.story_id and s.visibility = 'public'::text));

-- story_ratings
alter policy story_ratings_public_read on public.story_ratings
  using (exists (select 1 from stories s
    where s.id = story_ratings.story_id
      and (s.visibility = 'public'::text or s.owner_id = (select auth.uid()))));
alter policy story_ratings_own_update on public.story_ratings
  using ((select auth.uid()) = user_id)
  with check (((select auth.uid()) = user_id) and exists (select 1 from stories s
    where s.id = story_ratings.story_id and s.visibility = 'public'::text
      and (s.owner_id is null or s.owner_id <> (select auth.uid()))));
alter policy story_ratings_own_delete on public.story_ratings
  using ((select auth.uid()) = user_id);
alter policy story_ratings_own_insert on public.story_ratings
  with check (((select auth.uid()) = user_id) and exists (select 1 from stories s
    where s.id = story_ratings.story_id and s.visibility = 'public'::text
      and (s.owner_id is null or s.owner_id <> (select auth.uid()))));

-- style_references
alter policy style_references_own_select on public.style_references
  using ((select auth.uid()) = user_id);

-- subscriptions
alter policy subscriptions_own_select on public.subscriptions
  using ((select auth.uid()) = user_id);

-- turn_embeddings
alter policy turn_embeddings_own_select on public.turn_embeddings
  using (exists (select 1 from turns t
    join playthroughs p on p.id = t.playthrough_id
    where t.id = turn_embeddings.turn_id and p.user_id = (select auth.uid())));

-- turns
alter policy turns_own_select on public.turns
  using (exists (select 1 from playthroughs p
    where p.id = turns.playthrough_id and p.user_id = (select auth.uid())));
alter policy turns_own_insert on public.turns
  with check (exists (select 1 from playthroughs p
    where p.id = turns.playthrough_id and p.user_id = (select auth.uid())));

-- ── (B) Drop never-used HNSW indexes (EXPLAIN-verified dead weight) ────────
drop index if exists public.turn_embeddings_hnsw_cos;
drop index if exists public.lorebook_entries_hnsw_cos;
drop index if exists public.memory_summaries_hnsw_cos;

-- ── (C) Index the advisor-flagged unindexed FKs ─────────────────────────────
create index if not exists pcs_character_id_idx
  on public.playthrough_character_states (character_id);
create index if not exists character_beliefs_character_id_idx
  on public.character_beliefs (character_id);
create index if not exists character_experiences_character_id_idx
  on public.character_experiences (character_id);
create index if not exists scene_images_ledger_id_idx
  on public.scene_images (ledger_id);
create index if not exists moderation_flags_reviewed_by_idx
  on public.moderation_flags (reviewed_by);

-- =========================================================================
-- Sanity (after apply):
--   select count(*) from pg_policies where schemaname='public'
--     and (qual like '%auth.uid()%' and qual not like '%( SELECT auth.uid()%');
--   -- Expected: 0 (all rewritten)
--   select indexname from pg_indexes where indexname like '%hnsw%';
--   -- Expected: none of the 3 dropped names
-- =========================================================================
