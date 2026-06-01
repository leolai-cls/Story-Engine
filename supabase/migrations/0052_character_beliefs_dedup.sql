-- 0052 · 角色信念去重 (Audit HIGH-3 修復)
--
-- 2026-06-01: Audit 揾到 — writeBeliefs 個 "new" path 係無條件 insert · 冇檢查
-- 同 (subject+predicate) 嘅 active 信念已存在。AI 跨回合會重複 emit 同一信念
-- → 多個 active row (valid_to IS NULL) → 讀取時同一事實 repeat · 甚至兩個矛盾
-- 「事實」同時餵 Narrator (正正係呢個功能想防嘅穿崩)。
--
-- 修法：partial unique index (per exact triple-key · 只 active row)。配合 code 層
-- insert 前先 invalidate 舊 active (見 experience-writer.ts writeBeliefs)。
-- 註：predicate 係 AI free text · 語意漂移 (「以為」vs「認為」) 嘅 dupe 仍可能 ·
-- 屬已知 AI-extraction 限制 (CLAUDE.md entity-dedup open item) · 但 exact-key dupe
-- 由呢個 index 結構性消除。

-- 先清走現有重複嘅 active 信念 (保留最新嗰個 · 舊嘅 invalidate)。
-- (現時 prod 0 row · 但寫咗 defensive · 將來 re-run 安全。)
update public.character_beliefs cb
set valid_to = now(), invalidated_by_turn = established_turn
where valid_to is null
  and exists (
    select 1 from public.character_beliefs cb2
    where cb2.playthrough_id = cb.playthrough_id
      and cb2.character_id = cb.character_id
      and cb2.subject = cb.subject
      and cb2.predicate = cb.predicate
      and cb2.valid_to is null
      and cb2.created_at > cb.created_at
  );

create unique index if not exists char_beliefs_one_active
  on public.character_beliefs (playthrough_id, character_id, subject, predicate)
  where valid_to is null;
