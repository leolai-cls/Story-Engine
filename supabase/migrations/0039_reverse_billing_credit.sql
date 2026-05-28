-- Migration 0039 — Reverse billing credit RPC for Stripe refund flow
-- ===========================================================
-- Session 16 PM Review #2 (C-07): Stripe `charge.refunded` event was
-- falling through to default case · user got their money back but
-- credits stayed in their wallet. Real-money platform loss.
--
-- This RPC mirrors apply_billing_credit but with negative delta.
-- Symmetric idempotency: keyed on (user, reason='refund', invoice_id)
-- so duplicate Stripe deliveries don't double-debit.
--
-- Balance floored at 0 — if user already spent the granted credits,
-- we can't debit further. Audit trail still records the attempted
-- reversal with metadata.attempted_delta vs metadata.actual_delta.
--
-- REQUIRES: 0030 (apply_billing_credit pattern), 0036 (null key guard).

create or replace function public.reverse_billing_credit(
  p_user_id uuid,
  p_attempted_delta integer,  -- positive number · we'll subtract it
  p_idempotency_key text,     -- typically refund.id or invoice.id
  p_metadata jsonb default '{}'::jsonb
)
returns table(success boolean, new_balance integer, actual_delta integer, was_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing_id uuid;
  v_current_balance integer;
  v_new_balance integer;
  v_actual_delta integer;
begin
  if p_attempted_delta <= 0 then
    raise exception 'reverse_billing_credit: attempted_delta must be positive · got %', p_attempted_delta;
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'reverse_billing_credit: idempotency_key required (got null or empty)';
  end if;

  -- Idempotency check · keyed on (user_id, reason='refund', metadata.idempotency_key)
  select id into v_existing_id
  from public.credit_ledger
  where user_id = p_user_id
    and reason = 'refund'
    and metadata->>'idempotency_key' = p_idempotency_key
  limit 1;

  if v_existing_id is not null then
    select credit_balance into v_new_balance from public.profiles where id = p_user_id;
    return query select true, v_new_balance, 0, true;
    return;
  end if;

  -- Atomic: lock row, compute floor-at-0 delta, update + ledger
  select credit_balance into v_current_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'reverse_billing_credit: profile % not found', p_user_id;
  end if;

  -- Floor at 0 · can't go negative · partial reversal logged
  v_actual_delta := least(p_attempted_delta, v_current_balance);

  update public.profiles
  set credit_balance = credit_balance - v_actual_delta,
      updated_at = now()
  where id = p_user_id
  returning credit_balance into v_new_balance;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, ref_type, metadata
  ) values (
    p_user_id, -v_actual_delta, v_new_balance, 'refund', 'stripe_refund',
    p_metadata
      || jsonb_build_object('idempotency_key', p_idempotency_key)
      || jsonb_build_object('attempted_delta', p_attempted_delta, 'actual_delta', v_actual_delta)
      || (case when v_actual_delta < p_attempted_delta
              then jsonb_build_object('partial_reversal', true, 'reason_partial', 'balance_floor_at_zero')
              else '{}'::jsonb
            end)
  );

  return query select true, v_new_balance, v_actual_delta, false;
end;
$function$;

revoke execute on function public.reverse_billing_credit(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.reverse_billing_credit(uuid, integer, text, jsonb) to service_role;

-- Add 'refund' to credit_ledger.reason CHECK if not already permitted
-- (the CHECK was added in 0006/0007 with limited enum)
do $$
declare
  v_check_def text;
begin
  select pg_get_constraintdef(c.oid) into v_check_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'credit_ledger'
    and c.contype = 'c'
    and c.conname like '%reason%check%';

  if v_check_def is not null and v_check_def not like '%refund%' then
    -- Drop + recreate with refund added
    execute 'alter table public.credit_ledger drop constraint if exists ' ||
            (select conname from pg_constraint where conrelid = 'public.credit_ledger'::regclass
             and contype = 'c' and pg_get_constraintdef(oid) like '%reason%' limit 1);
    -- Recreate with refund added · safe enum list
    alter table public.credit_ledger
      add constraint credit_ledger_reason_check
      check (reason in ('sub_grant', 'sub_renewal', 'topup', 'admin_adjust',
                        'turn_charge', 'free_tier_refresh', 'refund'));
  end if;
exception when others then
  -- If the CHECK doesn't exist yet (clean install) we don't need to do anything
  raise notice '[0039] credit_ledger reason CHECK update skipped: %', sqlerrm;
end $$;
