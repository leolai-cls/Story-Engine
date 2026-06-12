-- 0065 · QA 夜間自動試玩 harness (Session 19 · 2026-06-12 · deep-plan 第 1 波)
-- (a) qa_reports — 每晚自動試玩嘅評分報告 (service-role only · 唔俾任何用戶讀寫)
-- (b) qa_grant_credits — 俾 QA bot 撥測試 credits · 跟 hard rule #4:
--     永遠唔 mutate balance 而唔寫 ledger entry (atomic · 同一 transaction)
-- Applied to prod via Supabase MCP 2026-06-12 (function 經兩次迭代先匹配
-- ledger 嘅 reason/ref_type check constraints — 呢度係最終版)。

create table if not exists public.qa_reports (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  playthrough_id uuid,
  turns_played integer not null default 0,
  verdict text not null check (verdict in ('green','amber','red')),
  metrics jsonb not null default '{}'::jsonb,
  judge jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.qa_reports enable row level security;
-- 冇任何 policy = anon/authenticated 全部讀寫唔到 · 只有 service role bypass。

create or replace function public.qa_grant_credits(
  p_user uuid,
  p_amount integer,
  p_note text default 'qa_nightly_grant'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  if p_amount <= 0 or p_amount > 100000 then
    raise exception 'qa_grant_credits: invalid amount %', p_amount;
  end if;
  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user
    returning credit_balance into v_new_balance;
  if v_new_balance is null then
    raise exception 'qa_grant_credits: user % not found', p_user;
  end if;
  -- reason/ref_type 必須喺 credit_ledger 嘅 check constraint 清單內:
  -- reason='admin_adjust' · ref_type='admin' · QA 標記放 metadata
  insert into public.credit_ledger (user_id, delta, balance_after, reason, ref_type, metadata)
  values (p_user, p_amount, v_new_balance, 'admin_adjust', 'admin',
          jsonb_build_object('granted_by', 'qa_nightly_harness', 'note', p_note));
  return v_new_balance;
end;
$$;

-- service-role only:撤走所有普通角色嘅執行權 (security definer 必須鎖)
revoke execute on function public.qa_grant_credits(uuid, integer, text) from public;
revoke execute on function public.qa_grant_credits(uuid, integer, text) from anon;
revoke execute on function public.qa_grant_credits(uuid, integer, text) from authenticated;

-- SANITY
do $$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='qa_reports') then
    raise exception 'qa_reports table missing';
  end if;
  if not exists (select 1 from pg_proc where proname='qa_grant_credits') then
    raise exception 'qa_grant_credits function missing';
  end if;
end $$;
