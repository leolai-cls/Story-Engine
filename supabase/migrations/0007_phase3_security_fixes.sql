-- Migration 0007 — Phase 3 Security + Logic fixes (Wave 1)
--
-- Addresses Phase 3 deep audit critical findings:
--   - P3-SEC-C-01  🛑 SHOWSTOPPER — apply_credit_charge missing auth.uid()
--                  guard. ANY logged-in user could drain or mint any
--                  user's balance via RPC. Closed by adding caller check
--                  inside the function (auth.uid() must match p_user_id,
--                  unless caller is service_role).
--   - P3-LOGIC-H-03 credits_charged write was a separate UPDATE after the
--                  RPC, breaking atomicity. Folded INTO the RPC so turn
--                  row + ledger are always in sync (single transaction).
--   - P3-LOGIC-M-08 OUT params + same-named locals fragile pattern.
--                  Replaced with `return query select` for explicitness.
--   - P3-LOGIC-M-11 profile_not_found raised plain text — JS wrapper
--                  couldn't branch. Now uses explicit errcode 'P0002'.
--   - P3-LOGIC-L-16 / SEC-M-04 ref_type CHECK had misleading `null`
--                  literal in IN list. Replaced with `is null or in (...)`.
--
-- REQUIRES: 0001-0006 applied.


-- ============================================================================
-- Drop + recreate apply_credit_charge with security guard + atomic turn-row update
-- ============================================================================
-- Postgres can't change function arguments via CREATE OR REPLACE if signature
-- stays the same — and we want the same signature so existing TS callers
-- work unchanged. Use OR REPLACE.
-- ============================================================================
create or replace function public.apply_credit_charge(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_type text default null,
  p_ref_id uuid default null,
  p_metadata jsonb default null
)
returns table (new_balance integer, ledger_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_caller_uid uuid;
  v_current_balance integer;
  v_new_balance integer;
  v_ledger_id uuid;
begin
  -- ─── AUDIT FIX P3-SEC-C-01 — SHOWSTOPPER ───────────────────────────
  -- Verify the caller is allowed to charge the target user. Without this,
  -- any authenticated user could drain or mint any other user's balance.
  -- Two paths allowed: (a) user charging themselves, (b) service_role
  -- (webhook handler with admin key bypassing user auth).
  v_caller_uid := auth.uid();
  v_caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  if v_caller_role <> 'service_role' and (v_caller_uid is null or v_caller_uid <> p_user_id) then
    raise exception 'forbidden: caller % cannot charge user %', v_caller_uid, p_user_id
      using errcode = '42501'; -- insufficient_privilege
  end if;

  if p_delta = 0 then
    raise exception 'apply_credit_charge: delta cannot be 0' using errcode = '22023';
  end if;

  -- Lock the row so concurrent charges serialize cleanly.
  select credit_balance into v_current_balance
    from public.profiles
    where id = p_user_id
    for update;

  if v_current_balance is null then
    -- AUDIT FIX P3-LOGIC-M-11 — explicit errcode so JS wrapper can branch.
    raise exception 'profile_not_found for user %', p_user_id
      using errcode = 'P0002';
  end if;

  v_new_balance := v_current_balance + p_delta;

  if v_new_balance < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('current=%s delta=%s would_be=%s', v_current_balance, p_delta, v_new_balance);
  end if;

  -- Update balance
  update public.profiles
    set credit_balance = v_new_balance
    where id = p_user_id;

  -- Insert ledger row
  insert into public.credit_ledger (user_id, delta, balance_after, reason, ref_type, ref_id, metadata)
    values (p_user_id, p_delta, v_new_balance, p_reason, p_ref_type, p_ref_id, p_metadata)
    returning id into v_ledger_id;

  -- ─── AUDIT FIX P3-LOGIC-H-03 — fold credits_charged update into RPC ──
  -- Turn row + ledger now sync atomically. Previously a separate UPDATE
  -- could fail after RPC succeeded → turn row showed 0 credits while
  -- ledger had truth. CLAUDE.md hard rule #4 says off-by-one = trust collapse.
  if p_ref_type = 'turn' and p_ref_id is not null and p_delta < 0 then
    update public.turns
      set credits_charged = abs(p_delta)
      where id = p_ref_id;
  end if;

  -- AUDIT FIX P3-LOGIC-M-08 — `return query select` is clearer than
  -- the OUT-param + RETURN NEXT pattern (avoids shadowing risk).
  return query select v_new_balance::integer, v_ledger_id::uuid;
end;
$$;

-- Re-grant (signature unchanged but CREATE OR REPLACE doesn't preserve perms reliably)
grant execute on function public.apply_credit_charge(uuid, integer, text, text, uuid, jsonb) to authenticated;
grant execute on function public.apply_credit_charge(uuid, integer, text, text, uuid, jsonb) to service_role;


-- ============================================================================
-- P3-LOGIC-L-16 / SEC-M-04 — clean up credit_ledger.ref_type CHECK
-- ============================================================================
-- Original used `check (ref_type in (...values..., null))` — Postgres CHECK
-- semantics allow NULL via tristate logic regardless, but having `null` in
-- the IN list is misleading. Replace with explicit `is null or in (...)`.
-- ============================================================================
alter table public.credit_ledger
  drop constraint if exists credit_ledger_ref_type_check;
alter table public.credit_ledger
  add constraint credit_ledger_ref_type_check
  check (ref_type is null or ref_type in ('turn', 'story', 'subscription', 'topup', 'admin'));


-- ============================================================================
-- SANITY — verify the fix is live + showstopper closed
-- ============================================================================
do $$
declare
  v_proc_def text;
begin
  -- Function should reference auth.uid()
  select pg_get_functiondef(p.oid) into v_proc_def
    from pg_proc p
    where p.proname = 'apply_credit_charge';
  if v_proc_def is null or position('auth.uid()' in v_proc_def) = 0 then
    raise exception 'apply_credit_charge missing auth.uid() guard — SHOWSTOPPER NOT closed';
  end if;
  if position('credits_charged' in v_proc_def) = 0 then
    raise exception 'apply_credit_charge missing credits_charged fold — H-03 NOT fixed';
  end if;
end $$;
