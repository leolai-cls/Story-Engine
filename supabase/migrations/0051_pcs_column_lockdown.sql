-- 0051 · playthrough_character_states 欄位上鎖 (Audit BLOCKER B-1 修復)
--
-- 2026-06-01: Audit 揾到 — pcs_own_update policy (0002) 只 row-scoped · 冇 column
-- restriction。玩家可以喺 browser console PATCH 自己 playthrough 嘅 pcs row · 改：
--   - interaction_count = 999 → 強制 soul-upgrade + 觸發要俾錢嘅 experience AI call (燒錢)
--   - pending_tensions → 塞假 sediment 入 Narrator prompt (prompt injection)
--   - disposition / permanent_flags → maxed 好感度 / 解鎖紅線
-- CLAUDE.md hard rule #24 (auth.uid()=user_id UPDATE policy 唔夠·要 column restriction)。
--
-- 修法 (學 0002 protect_sensitive_profile_columns)：BEFORE UPDATE trigger · 非
-- service-role caller 改呢啲 server-managed 欄位一律 revert。所有合法寫入都係
-- service-role (背景 after() block 用 serviceClient · apply_turn_npc_changes 改用
-- serviceClient call · 見 turn route)。

create or replace function public.protect_pcs_server_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  caller_session text;
begin
  caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  caller_session := session_user::text;
  -- service_role (admin / 背景 server 寫) 放行
  if caller_role = 'service_role'
     or caller_session not in ('authenticated', 'anon') then
    return new;
  end if;

  -- 非 admin caller：所有 server-managed 欄位一律 revert 返舊值。
  -- 玩家唔應該直接寫呢個 table 任何嘢 (全部經 server service-role)。
  if new.disposition is distinct from old.disposition then
    new.disposition := old.disposition;
  end if;
  if new.permanent_flags is distinct from old.permanent_flags then
    new.permanent_flags := old.permanent_flags;
  end if;
  if new.dynamic_state is distinct from old.dynamic_state then
    new.dynamic_state := old.dynamic_state;
  end if;
  if new.interaction_count is distinct from old.interaction_count then
    new.interaction_count := old.interaction_count;
  end if;
  if new.pending_tensions is distinct from old.pending_tensions then
    new.pending_tensions := old.pending_tensions;
  end if;
  if new.last_interaction_turn is distinct from old.last_interaction_turn then
    new.last_interaction_turn := old.last_interaction_turn;
  end if;
  if new.recent_interactions_summary is distinct from old.recent_interactions_summary then
    new.recent_interactions_summary := old.recent_interactions_summary;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_pcs_server_columns() from public, anon, authenticated;

drop trigger if exists pcs_protect_server_columns on public.playthrough_character_states;
create trigger pcs_protect_server_columns
  before update on public.playthrough_character_states
  for each row execute function public.protect_pcs_server_columns();
