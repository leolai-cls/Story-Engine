-- Migration 0041 · Add 'scene_image_charge' + 'portrait_charge' reasons to
-- credit_ledger.reason CHECK constraint for Phase 8 scene visualization.
--
-- REQUIRES: 0039 (refund reason added · current enum baseline)

do $$
declare
  v_check_def text;
  v_check_name text;
begin
  -- Find the existing reason CHECK constraint
  select c.conname into v_check_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'credit_ledger'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%reason%';

  if v_check_name is not null then
    execute format('alter table public.credit_ledger drop constraint %I', v_check_name);
  end if;

  alter table public.credit_ledger
    add constraint credit_ledger_reason_check
    check (reason in (
      'sub_grant', 'sub_renewal', 'topup', 'admin_adjust',
      'turn_charge', 'story_charge', 'embed_charge',
      'free_tier_refresh', 'refund',
      'scene_image_charge',   -- Phase 8: scene illustration / comic / wallpaper gen
      'portrait_charge'        -- Phase 8: lazy character portrait gen at first scene
    ));
end $$;
