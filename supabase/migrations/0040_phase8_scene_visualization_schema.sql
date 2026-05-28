-- Migration 0040 — Phase 8 scene visualization schema
-- ===========================================================
-- Story Engine / Kieio Phase 8 backend wave 1 (2026-05-28).
--
-- Adds:
--   1. story_characters · visual fields for character sheet system
--      (visual_description · portrait_url · portrait_generated_at)
--   2. stories · 3-tier style selection (style_key · style_reference_url
--      · style_custom_prompt) + CHECK exactly-one constraint
--   3. NEW table scene_images · per-(playthrough, turn) generated images
--   4. NEW table style_references · user uploads · auto-expire 24h
--
-- REQUIRES: 0009 (community/stories), 0027 (NPC L3), 0039 (refund RPC)

-- ============================================================================
-- 1. story_characters · visual fields for character sheet system
-- ----------------------------------------------------------------------------
-- LAZY-generated · NULL until first scene gen that requires this character.
-- Cost charged to user at portrait creation time (40 credits each).
-- ============================================================================
alter table public.story_characters
  add column if not exists visual_description text,
  add column if not exists portrait_url text,
  add column if not exists portrait_generated_at timestamptz,
  add column if not exists portrait_provider text;

-- ============================================================================
-- 2. stories · 3-tier style selection (preset / upload / custom)
-- ----------------------------------------------------------------------------
-- Exactly one of (style_key | style_reference_url | style_custom_prompt) must
-- be set OR ALL NULL (story has no style yet · default to AI suggest on first
-- scene gen).
-- ============================================================================
alter table public.stories
  add column if not exists style_key text,
  add column if not exists style_reference_url text,
  add column if not exists style_custom_prompt text;

-- CHECK: at most one of 3 is set (all null = lazy AI suggest on first gen)
alter table public.stories drop constraint if exists stories_style_mode_check;
alter table public.stories add constraint stories_style_mode_check
  check (
    ((style_key is not null)::int +
     (style_reference_url is not null)::int +
     (style_custom_prompt is not null)::int) <= 1
  );

-- ============================================================================
-- 3. scene_images · per-(playthrough, turn) generated images
-- ============================================================================
create table if not exists public.scene_images (
  id uuid primary key default gen_random_uuid(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  turn_index integer not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_type text not null check (image_type in ('illustration', 'comic', 'wallpaper')),
  aspect_ratio text not null,
  provider text not null,        -- 'openrouter:google/gemini-2.5-flash-image' etc.
  model_id text not null,
  storage_url text not null,     -- public Supabase Storage URL
  thumbnail_url text,            -- 256x256 webp · null = no thumbnail yet
  prompt_text text not null,     -- final composed prompt (audit trail · mod review)
  style_mode text not null check (style_mode in ('preset', 'upload', 'custom', 'ai_suggested')),
  style_value text,              -- style_key OR reference URL OR custom prompt text · for retro
  character_ids uuid[],          -- which character_ids appeared in scene
  credits_charged integer not null,
  ledger_id uuid references public.credit_ledger(id),
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected', 'soft_deleted')),
  moderation_categories text[],  -- if rejected · categories that triggered
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists scene_images_playthrough_idx
  on public.scene_images (playthrough_id, turn_index);
create index if not exists scene_images_user_recent_idx
  on public.scene_images (user_id, created_at desc);
create index if not exists scene_images_moderation_idx
  on public.scene_images (moderation_status)
  where moderation_status = 'pending';

alter table public.scene_images enable row level security;

drop policy if exists scene_images_own_select on public.scene_images;
create policy scene_images_own_select on public.scene_images
  for select using (auth.uid() = user_id);

-- Service-role only INSERT (server action writes via service role · same pattern
-- as turn writes · prevents direct client INSERT bypass of credit charge)
drop policy if exists scene_images_admin_select on public.scene_images;
create policy scene_images_admin_select on public.scene_images
  for select using (public.is_admin());

-- ============================================================================
-- 4. style_references · user uploads · auto-expire 24h
-- ============================================================================
create table if not exists public.style_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_url text not null,
  original_filename text,
  file_size_bytes integer,
  mime_type text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'expired')),
  moderation_categories text[],
  used_in_stories uuid[],         -- which stories use this as default style
  created_at timestamptz not null default now()
);

create index if not exists style_references_user_idx
  on public.style_references (user_id, created_at desc);
create index if not exists style_references_expires_idx
  on public.style_references (expires_at)
  where moderation_status != 'expired';

alter table public.style_references enable row level security;

drop policy if exists style_references_own_select on public.style_references;
create policy style_references_own_select on public.style_references
  for select using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — service-role writes only via upload server action

-- ============================================================================
-- 5. SANITY
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='story_characters'
                   and column_name='portrait_url') then
    raise exception '0040: story_characters.portrait_url missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='stories'
                   and column_name='style_key') then
    raise exception '0040: stories.style_key missing';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='scene_images') then
    raise exception '0040: scene_images table missing';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='style_references') then
    raise exception '0040: style_references table missing';
  end if;
end $$;
