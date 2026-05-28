-- Migration 0043 · Phase 8 Wave 3 Audit Cycle 2 fix
--
-- Migration 0041 added 'scene_image_charge' + 'portrait_charge' to
-- credit_ledger.reason CHECK, but FORGOT to extend ref_type CHECK to allow
-- 'scene_image' + 'character_portrait'. Result: every scene gen charge call
-- (chargeCredits with refType='scene_image') would FAIL at DB layer with
-- CHECK constraint violation. Feature 100% broken without this fix.
--
-- Cycle 2 cross-dimension audit caught it (TS ChargeRefType union ≠ DB CHECK).
-- Same drift class as hard rule #28 / #36.

do $$
declare
  v_check_name text;
begin
  -- Find the existing ref_type CHECK
  select c.conname into v_check_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'credit_ledger'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%ref_type%';

  if v_check_name is not null then
    execute format(
      'alter table public.credit_ledger drop constraint %I',
      v_check_name
    );
  end if;

  alter table public.credit_ledger
    add constraint credit_ledger_ref_type_check
    check (
      ref_type is null
      or ref_type in (
        'turn',
        'story',
        'subscription',
        'topup',
        'admin',
        'scene_image',          -- Phase 8 · ref_id = scene_images.id
        'character_portrait'    -- Phase 8 · ref_id = story_characters.id
      )
    );
end $$;

comment on constraint credit_ledger_ref_type_check on public.credit_ledger is
  'Matches ChargeRefType TS union in lib/billing/credits.ts · update both when adding new ref type';
