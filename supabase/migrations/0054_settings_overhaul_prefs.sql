-- Migration 0047: settings-overhaul preference columns.
--
-- Adds the user-preference columns the revamped /settings page writes:
--   • theme_preference        — light / dark / system (UI theme toggle)
--   • default_story_language  — pre-fills narrative language at creation
--                               (NULL = no default · ask each time)
--   • notify_product          — product / feature update emails (default on)
--   • notify_marketing        — marketing emails (default OFF · opt-in)
--
-- All are self-service columns the user fully controls. RLS on profiles
-- already lets a user UPDATE their own row (auth.uid() = id), and the
-- protect_sensitive_profile_columns trigger only guards billing/age columns,
-- so these are writable by the owner without extra policy.

alter table public.profiles
  add column if not exists theme_preference text not null default 'system',
  add column if not exists default_story_language text,
  add column if not exists notify_product boolean not null default true,
  add column if not exists notify_marketing boolean not null default false;

-- Constrain theme to the three valid values.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_theme_preference_check'
  ) then
    alter table public.profiles
      add constraint profiles_theme_preference_check
      check (theme_preference in ('light', 'dark', 'system'));
  end if;
end $$;
