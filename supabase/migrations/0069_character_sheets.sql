-- Migration 0069 — Wave 3 · character design sheets (fal gpt-image-2)
-- ===========================================================================
-- 「角色設定圖」= a premium, per-(playthrough, character, user) generated model
-- sheet (turnaround + expressions + gear + palette). It is BOTH the user's
-- collectible AND the consistency anchor for later scene-image gen (stage 2
-- feeds the sheet URL back as an image-to-image reference).
--
-- Stored per-user (not on story_characters) so a non-owner playing a PUBLIC
-- story can still generate + own their sheet without writing to the author's
-- rows (same tenant-isolation lesson as B1 · hard rule #15). Service-role
-- writes only (mirrors scene_images · prevents client INSERT bypassing the
-- credit charge).
--
-- Also extends credit_ledger reason + ref_type CHECK for the new charge.
-- Keep in sync with ChargeReason / ChargeRefType in lib/billing/credits.ts
-- (hard rule #28 / #36 — two-sided contract).
--
-- REQUIRES: 0040 (story_characters + scene_images), 0043 (ref_type baseline)

-- ─── 1. character_sheets table ────────────────────────────────────────────
create table if not exists public.character_sheets (
  id uuid primary key default gen_random_uuid(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  story_character_id uuid not null references public.story_characters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_url text not null,          -- public Supabase Storage URL (scene-images bucket)
  prompt_text text not null,          -- composed gpt-image-2 prompt (audit / mod review)
  style_key text,                     -- KIEIO style used
  provider text not null,             -- 'fal:openai/gpt-image-2'
  model_id text not null,
  credits_charged integer not null,
  ledger_id uuid references public.credit_ledger(id),
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected', 'soft_deleted')),
  created_at timestamptz not null default now()
);

create index if not exists character_sheets_pt_char_idx
  on public.character_sheets (playthrough_id, story_character_id, created_at desc);
create index if not exists character_sheets_user_recent_idx
  on public.character_sheets (user_id, created_at desc);

alter table public.character_sheets enable row level security;

drop policy if exists character_sheets_own_select on public.character_sheets;
create policy character_sheets_own_select on public.character_sheets
  for select using ((select auth.uid()) = user_id);

drop policy if exists character_sheets_admin_select on public.character_sheets;
create policy character_sheets_admin_select on public.character_sheets
  for select using (public.is_admin());

-- No INSERT / UPDATE / DELETE policies — service-role writes only (server action).

-- ─── 2. credit_ledger.reason CHECK (+ character_sheet_charge) ──────────────
do $$
declare v_name text;
begin
  select c.conname into v_name
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  where t.relname = 'credit_ledger' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%reason%';
  if v_name is not null then
    execute format('alter table public.credit_ledger drop constraint %I', v_name);
  end if;
  alter table public.credit_ledger
    add constraint credit_ledger_reason_check
    check (reason in (
      'sub_grant', 'sub_renewal', 'topup', 'admin_adjust',
      'turn_charge', 'story_charge', 'embed_charge',
      'free_tier_refresh', 'refund',
      'scene_image_charge', 'portrait_charge',
      'character_sheet_charge'   -- Wave 3: character design sheet (fal gpt-image-2)
    ));
end $$;

-- ─── 3. credit_ledger.ref_type CHECK (+ character_sheet) ───────────────────
do $$
declare v_name text;
begin
  select c.conname into v_name
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  where t.relname = 'credit_ledger' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%ref_type%';
  if v_name is not null then
    execute format('alter table public.credit_ledger drop constraint %I', v_name);
  end if;
  alter table public.credit_ledger
    add constraint credit_ledger_ref_type_check
    check (
      ref_type is null
      or ref_type in (
        'turn', 'story', 'subscription', 'topup', 'admin',
        'scene_image', 'character_portrait',
        'character_sheet'   -- Wave 3 · ref_id = character_sheets.id
      )
    );
end $$;

-- ─── 4. SANITY ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='character_sheets') then
    raise exception '0069: character_sheets table missing';
  end if;
end $$;
