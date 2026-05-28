-- Migration 0034 — Restore display_name + avatar_url extraction in handle_new_user
--
-- Wave 2 i18n audit (Session 16 · CRIT-02) discovered that migration 0033
-- (signup grant 50 → 1000) inadvertently dropped the display_name + avatar_url
-- COALESCE block from the handle_new_user trigger. Result: every Google OAuth
-- signup since 0033 deployed has NULL display_name + NULL avatar_url — exactly
-- the OAuth users the parallel "Google login subdomain fix" was meant to help.
--
-- This migration:
--   1. Restores the COALESCE block from 0008.
--   2. Backfills NULL display_name + avatar_url for any profile whose
--      auth.users.raw_user_meta_data still has the source values.
--
-- Idempotent · safe to re-run.
--
-- REQUIRES: 0033 applied.

-- ============================================================================
-- 1. Restored trigger
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Profile insert · grant 1000 credits per Pricing v3 spec (0033) ·
  -- extract display_name + avatar_url from OAuth provider metadata (0008).
  insert into public.profiles (id, display_name, avatar_url, credit_balance, created_at)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      new.email
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    1000,
    now()
  )
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

-- ============================================================================
-- 2. Backfill NULL display_name + avatar_url from auth.users metadata
-- ----------------------------------------------------------------------------
-- Only touches profiles where the field is currently NULL AND the source
-- metadata exists. Idempotent: re-running finds no NULL rows where source
-- is also non-null (already backfilled).
-- ============================================================================
do $$
declare
  v_backfilled_names integer := 0;
  v_backfilled_avatars integer := 0;
begin
  with name_updates as (
    update public.profiles p
    set display_name = coalesce(
      u.raw_user_meta_data->>'name',
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'user_name',
      u.email
    )
    from auth.users u
    where u.id = p.id
      and p.display_name is null
      and coalesce(
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'user_name',
        u.email
      ) is not null
    returning 1
  )
  select count(*) into v_backfilled_names from name_updates;

  with avatar_updates as (
    update public.profiles p
    set avatar_url = coalesce(
      u.raw_user_meta_data->>'avatar_url',
      u.raw_user_meta_data->>'picture'
    )
    from auth.users u
    where u.id = p.id
      and p.avatar_url is null
      and coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ) is not null
    returning 1
  )
  select count(*) into v_backfilled_avatars from avatar_updates;

  raise notice '[0034] backfilled display_name for % profile(s), avatar_url for % profile(s)',
    v_backfilled_names, v_backfilled_avatars;
end $$;
