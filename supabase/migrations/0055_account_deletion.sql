-- Migration 0048: account self-deletion RPC.
--
-- Part of the settings overhaul (2026-06-01). Lets an authenticated user
-- permanently delete their own account + all owned data. SECURITY DEFINER so
-- it can cascade across tables the user can't directly DELETE, but hard-scoped
-- to auth.uid() — a user can only ever delete THEMSELVES.
--
-- Stripe subscription cancellation is handled in the action layer BEFORE
-- calling this (Postgres can't reach the Stripe API).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Delete owned rows. playthroughs / credit_ledger / subscriptions key off
  -- user_id; stories keys off owner_id; story_comments / story_ratings off
  -- user_id. Most also cascade from auth.users, but clear explicitly so the
  -- final auth.users delete can't be blocked by a stray FK.
  delete from public.story_comments    where user_id  = uid;
  delete from public.story_ratings     where user_id  = uid;
  delete from public.credit_ledger     where user_id  = uid;
  delete from public.subscriptions     where user_id  = uid;
  delete from public.playthroughs      where user_id  = uid;
  delete from public.stories           where owner_id = uid;
  delete from public.profiles          where id       = uid;

  -- Remove the auth user last (cascades anything left).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
