-- Migration 0001 — Initial schema for Story Engine
-- Tables: profiles, stories, story_characters, playthroughs,
--         playthrough_character_states, turns
-- Plus: auto-create profile trigger, updated_at trigger, RLS policies

-- =============================================================
-- Extensions
-- =============================================================
create extension if not exists "uuid-ossp" with schema extensions;

-- =============================================================
-- Helper: updated_at trigger function
-- =============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- profiles — 1:1 with auth.users
-- =============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'zh-Hant',
  avatar_url text,
  is_age_verified boolean not null default false,
  adult_mode_enabled boolean not null default false,
  subscription_tier text not null default 'free',
  credit_balance integer not null default 50,
  credit_period_end timestamptz,
  default_llm_provider text,
  default_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile when a new auth user signs up
-- Handles common OAuth name fields: Google ('name', 'full_name'),
-- GitHub ('name', 'user_name'), and falls back to email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
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
    )
  );
  return new;
end;
$$;

-- Harden set_updated_at function with explicit search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- stories — story templates (owner-created, official, or community)
-- =============================================================
create table public.stories (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  prompt_seed text not null,
  state_schema jsonb not null default '{}'::jsonb,
  story_bible jsonb not null default '{}'::jsonb,
  opening_narrative text,
  genre text,
  tags text[] not null default array[]::text[],
  language text not null default 'zh-Hant',
  content_rating text not null default 'sfw' check (content_rating in ('sfw', 'soft', 'adult')),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  origin text not null default 'user' check (origin in ('user', 'community', 'official')),
  cover_image_url text,
  play_count integer not null default 0,
  fork_count integer not null default 0,
  rating_avg numeric(3,2),
  rating_count integer not null default 0,
  allow_remix boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_owner_idx on public.stories(owner_id);
create index stories_public_idx on public.stories(visibility, created_at desc)
  where visibility = 'public';
create index stories_origin_idx on public.stories(origin);

create trigger stories_updated_at
  before update on public.stories
  for each row execute function public.set_updated_at();

-- =============================================================
-- story_characters — NPC templates per story
-- =============================================================
create table public.story_characters (
  id uuid primary key default uuid_generate_v4(),
  story_id uuid not null references public.stories(id) on delete cascade,
  name text not null,
  role text,
  personality_traits text[] not null default array[]::text[],
  backstory text,
  core_motivation text,
  red_lines text[] not null default array[]::text[],
  voice_sample text,
  arc_description text,
  default_disposition_toward_protagonist text,
  created_at timestamptz not null default now()
);

create index story_characters_story_idx on public.story_characters(story_id);

-- =============================================================
-- playthroughs — a user's instance of playing a story
-- =============================================================
create table public.playthroughs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  character_name text,
  current_state jsonb not null default '{}'::jsonb,
  llm_provider text,
  llm_model text,
  turn_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived', 'abandoned')),
  last_played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index playthroughs_user_idx on public.playthroughs(user_id, last_played_at desc);
create index playthroughs_story_idx on public.playthroughs(story_id);

-- =============================================================
-- playthrough_character_states — per-playthrough NPC state
-- =============================================================
create table public.playthrough_character_states (
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  character_id uuid not null references public.story_characters(id) on delete cascade,
  disposition jsonb not null default '{}'::jsonb,
  recent_interactions_summary text,
  permanent_flags text[] not null default array[]::text[],
  last_interaction_turn integer,
  updated_at timestamptz not null default now(),
  primary key (playthrough_id, character_id)
);

create trigger pcs_updated_at
  before update on public.playthrough_character_states
  for each row execute function public.set_updated_at();

-- =============================================================
-- turns — each user action + AI response
-- =============================================================
create table public.turns (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  turn_index integer not null,
  role text not null check (role in ('user', 'ai')),
  text text not null,
  state_delta jsonb,
  director_verdict jsonb,
  skill_check jsonb,
  llm_provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  credits_charged integer,
  director_input_tokens integer,
  director_output_tokens integer,
  created_at timestamptz not null default now(),
  unique (playthrough_id, turn_index)
);

create index turns_playthrough_idx on public.turns(playthrough_id, turn_index);

-- =============================================================
-- RLS — enable on all tables
-- =============================================================
alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.story_characters enable row level security;
alter table public.playthroughs enable row level security;
alter table public.playthrough_character_states enable row level security;
alter table public.turns enable row level security;

-- profiles policies
create policy "profiles_own_read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_own_update" on public.profiles
  for update using (auth.uid() = id);

-- stories policies
create policy "stories_owner_all" on public.stories
  for all using (auth.uid() = owner_id);
create policy "stories_public_read" on public.stories
  for select using (visibility in ('public', 'unlisted'));
create policy "stories_official_read" on public.stories
  for select using (origin = 'official' and visibility != 'private');

-- story_characters policies (inherit from story access)
create policy "story_characters_read_via_story" on public.story_characters
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
      and (s.owner_id = auth.uid() or s.visibility in ('public', 'unlisted') or s.origin = 'official')
    )
  );
create policy "story_characters_owner_write" on public.story_characters
  for all using (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.owner_id = auth.uid()
    )
  );

-- playthroughs policies (user owns their playthroughs)
create policy "playthroughs_own_all" on public.playthroughs
  for all using (auth.uid() = user_id);

-- playthrough_character_states policies
create policy "pcs_own_all" on public.playthrough_character_states
  for all using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

-- turns policies
create policy "turns_own_all" on public.turns
  for all using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );
