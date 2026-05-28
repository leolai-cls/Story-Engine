-- Migration 0042 · Phase 8 Wave 3 Audit Cycle 1 fix DF-CRIT-02
--
-- stories.style_key is a `text` column added by migration 0040 without enum
-- CHECK constraint matching the StyleKey TS union in lib/ai/image-styles.ts.
-- Per CLAUDE.md hard rule #28 + #36 (spec-vs-code drift = doc hygiene failure):
-- any admin SQL edit or future v1.1 sub-style write produces invalid value
-- → modal render crashes on `KIEIO_STYLES[invalid].name[locale]`.
--
-- This migration adds the matching enum CHECK · clears any garbage value to NULL
-- (defensive · 0 prod users so this is no-op today but safe in future).

do $$
declare
  v_garbage_count int;
begin
  -- Defensive: NULL out any value that doesn't match the 10 known StyleKey values.
  -- Should be 0 today (Phase 8 just shipped · no user has chosen a style yet)
  -- but protects against admin edits.
  update public.stories
    set style_key = null
    where style_key is not null
      and style_key not in (
        'hk-manhua', 'jp-manga', 'jp-anime', 'kr-webtoon', 'us-comic',
        'cn-ink', 'cinematic', 'photographic', 'cyberpunk', 'fantasy-art'
      );
  get diagnostics v_garbage_count = row_count;
  if v_garbage_count > 0 then
    raise notice '0042: cleared % rows with invalid style_key', v_garbage_count;
  end if;
end $$;

alter table public.stories
  drop constraint if exists stories_style_key_enum_check;

alter table public.stories
  add constraint stories_style_key_enum_check
  check (
    style_key is null
    or style_key in (
      'hk-manhua', 'jp-manga', 'jp-anime', 'kr-webtoon', 'us-comic',
      'cn-ink', 'cinematic', 'photographic', 'cyberpunk', 'fantasy-art'
    )
  );

comment on constraint stories_style_key_enum_check on public.stories is
  'Phase 8 · matches StyleKey union in lib/ai/image-styles.ts · update both when adding new style';
