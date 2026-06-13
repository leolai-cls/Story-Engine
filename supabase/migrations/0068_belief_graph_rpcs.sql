-- 0068 · 信念圖譜寫入/查詢 RPC (記憶手術 M4 · Session 19 · 2026-06-13)
--
-- character_beliefs 表 + 去重 index 喺 0050/0052 已存在 (Session 16 角色靈魂工作),
-- 但寫入 code (experience-writer.ts writeBeliefs) Session 18 刪咗 → 表休眠。
-- 呢個 migration 補返欠咗嘅兩個函數,純-additive (只 CREATE FUNCTION · 唔掂任何
-- 現有 object) → 安全先 apply、後 deploy code (hard rule #12)。
--
-- 設計 (pm/architecture/04-memory.md · founder 2026-06-01 收窄):
--   信念 = 事實三元組 (角色, 謂詞, 對象) · 例「陳家明 以為 主角死咗」。
--   ⚠️ 只記事實 · 唔記性格/情緒/價值 (嗰啲壓扁角色 · 留出身故事)。一致性工具。
--   Temporal: 新信念 valid_to=null · 被推翻 → valid_to=now + invalidated_by_turn
--   (唔 delete · 保留歷史)。char_beliefs_one_active UNIQUE 保證每個
--   (pt, char, subject, predicate) 只有一個 active row。

-- ── apply_belief: invalidate-then-insert 原子寫入 ───────────────────────────
-- service-role only (跟 0050 lockdown · char_beliefs 冇 user-write policy)。
-- SECURITY DEFINER + revoke-from-users = 只有後台 service client 寫得到
-- (同 0065 qa_grant_credits 同一 proven 安全 pattern)。
create or replace function public.apply_belief(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_subject text,
  p_predicate text,
  p_object text,
  p_turn integer,
  p_weight real default 0.7
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- 防呆: 主要欄位唔可以空
  if coalesce(trim(p_subject), '') = ''
     or coalesce(trim(p_predicate), '') = ''
     or coalesce(trim(p_object), '') = '' then
    return null;
  end if;

  -- 完全相同嘅 active 三元組已存在 → idempotent no-op (AI 跨回合重 emit 同一事實)
  if exists (
    select 1 from public.character_beliefs
    where playthrough_id = p_playthrough_id
      and character_id = p_character_id
      and subject = p_subject
      and predicate = p_predicate
      and object = p_object
      and valid_to is null
  ) then
    return null;
  end if;

  -- 推翻: 關閉同一 (subject, predicate) 嘅舊 active 信念 (object 變咗 = 信念更新)
  update public.character_beliefs
    set valid_to = now(), invalidated_by_turn = p_turn
  where playthrough_id = p_playthrough_id
    and character_id = p_character_id
    and subject = p_subject
    and predicate = p_predicate
    and valid_to is null;

  insert into public.character_beliefs
    (playthrough_id, character_id, subject, predicate, object, established_turn, weight)
  values
    (p_playthrough_id, p_character_id, p_subject, p_predicate, p_object,
     p_turn, greatest(0::real, least(1::real, coalesce(p_weight, 0.7))))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.apply_belief(uuid, uuid, text, text, text, integer, real) from public;
revoke execute on function public.apply_belief(uuid, uuid, text, text, text, integer, real) from anon;
revoke execute on function public.apply_belief(uuid, uuid, text, text, text, integer, real) from authenticated;

-- ── query_playthrough_active_beliefs: as-of-now 全 playthrough 一次過讀 ──────
-- SECURITY INVOKER → RLS 照行 (char_beliefs_own_select · 用戶只讀到自己嘅);
-- granted authenticated (turn route 用 user client 讀 · 同 match_* RPC 一致)。
-- 一個 round-trip 攞晒所有 active 信念 · cap 防 prompt 爆 (hard rule #39)。
create or replace function public.query_playthrough_active_beliefs(
  p_playthrough_id uuid,
  p_limit integer default 24
)
returns table (
  character_id uuid,
  subject text,
  predicate text,
  object text,
  weight real,
  established_turn integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select character_id, subject, predicate, object, weight, established_turn
  from public.character_beliefs
  where playthrough_id = p_playthrough_id
    and valid_to is null
  order by weight desc, established_turn desc
  limit greatest(1, least(coalesce(p_limit, 24), 60));
$$;

grant execute on function public.query_playthrough_active_beliefs(uuid, integer) to authenticated;

-- ── SANITY ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'apply_belief') then
    raise exception 'apply_belief missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'query_playthrough_active_beliefs') then
    raise exception 'query_playthrough_active_beliefs missing';
  end if;
  -- 確認休眠表 + 去重 index 真係喺度 (唔係要起新)
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='character_beliefs') then
    raise exception 'character_beliefs table missing — expected from 0050';
  end if;
  if not exists (select 1 from pg_indexes where indexname='char_beliefs_one_active') then
    raise exception 'char_beliefs_one_active unique index missing — expected from 0052';
  end if;
end $$;
