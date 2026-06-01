-- 0053 · interaction_count atomic bump RPC (Audit HIGH-1 + M-1 修復)
--
-- 2026-06-01: Audit 揾到 — turn route 用 SELECT-then-UPDATE 累加 interaction_count ·
-- (a) 跨 serverless instance 嘅並行 turn 會 lost update (race · HIGH-1) ·
-- (b) 第一次出場但冇 disposition 變化嘅角色冇 pcs row · .update() 更新 0 row ·
--     increment 丟失 (M-1)。
--
-- 修法：atomic upsert RPC。insert-or-(increment) 一個 statement · race-safe ·
-- 自動處理 first-row missing · returning 新 count 俾升級 gate 用。
-- SECURITY DEFINER + service-role only (同 0024 apply_npc_dynamic_state 一致 ·
-- 亦令佢可以過 0051 column-protect trigger)。

create or replace function public.bump_interaction_count(
  p_playthrough_id uuid,
  p_character_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_count integer;
begin
  insert into public.playthrough_character_states
    (playthrough_id, character_id, interaction_count)
  values (p_playthrough_id, p_character_id, 1)
  on conflict (playthrough_id, character_id)
  do update set interaction_count = public.playthrough_character_states.interaction_count + 1
  returning interaction_count into v_new_count;
  return v_new_count;
end;
$$;

revoke execute on function public.bump_interaction_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bump_interaction_count(uuid, uuid) to service_role;
