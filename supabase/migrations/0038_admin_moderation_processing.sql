-- Migration 0038 — Admin moderation UI backend (P-03 launch blocker)
-- ===========================================================
-- Session 16 PM Review #2 (P-03) fix · CLAUDE.md hard rule #6 reactive path.
--
-- moderation_flags table accepts reports (since 0009) but had no admin
-- review UI · row gets inserted and silently rots forever. HK/TW
-- regulatory baseline requires reactive moderation channel + SLA.
--
-- Provides:
--   1. Admin role check function (reads auth.users.raw_app_meta_data)
--   2. RLS SELECT policy on moderation_flags for admins (was service-role only)
--   3. process_moderation_flag RPC · approve / dismiss / soft_delete actions
--   4. Soft-delete columns on stories + story_comments (status='hidden')
--
-- Founder onboarding (after migration applies):
--   In Supabase Dashboard → Auth → Users → click founder's user →
--   Raw App Meta Data → set {"role": "admin"} → Save.
--   No code change required to add additional admins later.
--
-- REQUIRES: 0009 (moderation_flags table) + 0030 (apply_billing_credit)

-- ============================================================================
-- 1. is_admin() helper · reads auth.users.raw_app_meta_data['role']
-- ============================================================================
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (raw_app_meta_data->>'role') = 'admin'
      from auth.users
      where id = p_user_id
    ),
    false
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- ============================================================================
-- 2. RLS · admin can SELECT moderation_flags · reporter can see own reports
-- ============================================================================
drop policy if exists moderation_flags_admin_read on public.moderation_flags;
create policy moderation_flags_admin_read on public.moderation_flags
  for select using (public.is_admin());

drop policy if exists moderation_flags_own_read on public.moderation_flags;
create policy moderation_flags_own_read on public.moderation_flags
  for select using (auth.uid() = reporter_id);

-- ============================================================================
-- 3. Soft-delete columns · stories.is_hidden + story_comments.is_hidden
-- ----------------------------------------------------------------------------
-- Admin can hide content without dropping the row (preserve audit trail ·
-- reverse if action was wrong). User-facing queries filter is_hidden=false.
-- ============================================================================
alter table public.stories
  add column if not exists is_hidden boolean not null default false;
alter table public.story_comments
  add column if not exists is_hidden boolean not null default false;

create index if not exists stories_hidden_idx on public.stories(is_hidden) where is_hidden = true;
create index if not exists story_comments_hidden_idx on public.story_comments(is_hidden) where is_hidden = true;

-- ============================================================================
-- 4. process_moderation_flag RPC · admin action endpoint
-- ----------------------------------------------------------------------------
-- Atomic: validates admin role · updates flag status · optionally hides
-- the offending content. Triggered from /admin/moderation server action.
-- ============================================================================
create or replace function public.process_moderation_flag(
  p_flag_id uuid,
  p_action text,                -- 'approve' | 'dismiss' | 'soft_delete'
  p_review_notes text default null
)
returns table(
  success boolean,
  flag_id uuid,
  content_hidden boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag record;
  v_admin_id uuid;
  v_hidden boolean := false;
begin
  -- Auth: must be authenticated + must be admin
  v_admin_id := auth.uid();
  if v_admin_id is null then
    raise exception 'process_moderation_flag: not authenticated';
  end if;
  if not public.is_admin(v_admin_id) then
    raise exception 'process_moderation_flag: not admin';
  end if;

  -- Validate action
  if p_action not in ('approve', 'dismiss', 'soft_delete') then
    raise exception 'process_moderation_flag: invalid action %', p_action;
  end if;

  -- Load flag (must be pending)
  select * into v_flag from public.moderation_flags where id = p_flag_id;
  if v_flag is null then
    raise exception 'process_moderation_flag: flag % not found', p_flag_id;
  end if;
  if v_flag.status != 'pending' then
    raise exception 'process_moderation_flag: flag % already % at %',
      p_flag_id, v_flag.status, v_flag.reviewed_at;
  end if;

  -- If soft_delete: hide the offending content
  if p_action = 'soft_delete' then
    if v_flag.content_type = 'story' then
      update public.stories set is_hidden = true, updated_at = now()
        where id = v_flag.content_id;
    elsif v_flag.content_type = 'comment' then
      update public.story_comments set is_hidden = true
        where id = v_flag.content_id;
    end if;
    v_hidden := true;
  end if;

  -- Update flag · status maps to action
  update public.moderation_flags
    set status = case p_action
                   when 'approve' then 'actioned'      -- content reviewed but stays (warning issued etc)
                   when 'dismiss' then 'dismissed'      -- report unfounded
                   when 'soft_delete' then 'actioned'  -- content hidden
                 end,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = p_review_notes
    where id = p_flag_id;

  return query select true, p_flag_id, v_hidden;
end;
$$;

-- Service-role only? No — admins are real users; they call from server action
-- with their session token. Grant execute to authenticated; the is_admin()
-- check inside the function is the actual gate.
grant execute on function public.process_moderation_flag(uuid, text, text) to authenticated;

-- ============================================================================
-- 5. Sanity
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '0038: is_admin() function missing after migration';
  end if;
  if not exists (select 1 from pg_proc where proname = 'process_moderation_flag') then
    raise exception '0038: process_moderation_flag() function missing after migration';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stories' and column_name='is_hidden'
  ) then
    raise exception '0038: stories.is_hidden column missing after migration';
  end if;
end $$;
