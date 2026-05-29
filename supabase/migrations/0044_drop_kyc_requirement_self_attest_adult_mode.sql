-- Migration 0044 · 2026-05-29 · ADR-023
-- Founder rule (explicit): adult mode = self-attest 18+ · NO Stripe Identity KYC.
-- 「18 歲嗰個 user 話自己 18 歲就可以 · 唔需要做個認證」
--
-- This migration drops the trigger-level dependency: adult_mode_enabled no
-- longer requires is_age_verified. is_age_verified column kept for back-compat
-- but no longer a gate. (Column-level CHECK constraint dropped in 0045.)

create or replace function public.protect_sensitive_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  caller_role text;
  caller_session text;
begin
  caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );
  caller_session := session_user::text;
  if caller_role = 'service_role'
     or caller_session not in ('authenticated', 'anon') then
    return new;
  end if;

  -- For non-admin callers, revert any change to sensitive columns.
  if new.is_age_verified is distinct from old.is_age_verified then
    new.is_age_verified := old.is_age_verified;
  end if;
  -- ADR-023 (2026-05-29): adult_mode_enabled 唔再需要 is_age_verified=true.
  -- User self-attest 18+ 就得 · 移除 KYC dependency · 允許 user 自由 flip toggle.
  if new.credit_balance is distinct from old.credit_balance then
    new.credit_balance := old.credit_balance;
  end if;
  if new.credit_period_end is distinct from old.credit_period_end then
    new.credit_period_end := old.credit_period_end;
  end if;
  if new.subscription_tier is distinct from old.subscription_tier then
    new.subscription_tier := old.subscription_tier;
  end if;
  return new;
end;
$function$;

comment on function public.protect_sensitive_profile_columns is
  'ADR-023 (2026-05-29): adult_mode = self-attest 18+ · NO KYC. is_age_verified retained read-only for back-compat but not a gate.';
