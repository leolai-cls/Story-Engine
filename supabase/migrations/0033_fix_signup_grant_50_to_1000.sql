-- Migration 0033 — Fix signup grant from 50 → 1000 (per Pricing v3 spec)
-- USER EXPLICITLY AUTHORIZED option A (full fix + backfill) — 2026-05-28
--
-- Bug: pm/STATUS.md line 74 declares "Free signup 1k + 50/day" but
-- Migration 0001 column default + Migration 0008 trigger only granted
-- 50 credits. Users since launch have been under-granted by 950 credits.
--
-- Note: this file also documents migrations 0029-0032 which were applied
-- via Supabase MCP during the money tier ship but never committed to repo.
-- They're in production · this file is the first one to land in source.

-- 1. New default for credit_balance column
alter table public.profiles alter column credit_balance set default 1000;

-- 2. Update trigger to grant 1000
-- (Session 16 PM Review #2 C-08 cosmetic fix: added pg_temp to search_path
-- for consistency with other SECURITY DEFINER functions · 0034 supersedes
-- this function but this doc fix prevents future fresh-reset confusion.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, credit_balance, created_at)
  values (new.id, 1000, now())
  on conflict (id) do nothing;

  begin
    insert into public.credit_ledger
      (user_id, delta, balance_after, reason, ref_type, ref_id, metadata)
    values (
      new.id, 1000, 1000, 'sub_grant', null, null,
      jsonb_build_object('source', 'signup_initial_grant', 'tier', 'free', 'amount', 1000)
    );
  exception when others then
    raise warning '[handle_new_user] grant ledger insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- 3. Backfill existing under-granted users (+950 to anyone who got 50 signup grant)
do $$
declare
  v_user record;
  v_backfill_count integer := 0;
begin
  for v_user in
    select p.id, p.credit_balance
    from public.profiles p
    where exists (
      select 1 from public.credit_ledger l
      where l.user_id = p.id
        and l.reason = 'sub_grant'
        and l.delta = 50
        and l.metadata->>'source' = 'signup_initial_grant'
    )
    and not exists (
      select 1 from public.credit_ledger l2
      where l2.user_id = p.id
        and l2.metadata->>'source' = 'signup_grant_backfill_0033'
    )
  loop
    update public.profiles
      set credit_balance = credit_balance + 950
      where id = v_user.id;

    insert into public.credit_ledger
      (user_id, delta, balance_after, reason, ref_type, ref_id, metadata)
    values (
      v_user.id, 950, v_user.credit_balance + 950, 'admin_adjust', null, null,
      jsonb_build_object(
        'source', 'signup_grant_backfill_0033',
        'reason', 'pricing_v3_spec_was_1000_code_was_50',
        'original_grant', 50,
        'corrected_to', 1000
      )
    );

    v_backfill_count := v_backfill_count + 1;
  end loop;

  raise notice '[0033] backfilled +950 credits to % users', v_backfill_count;
end;
$$;
