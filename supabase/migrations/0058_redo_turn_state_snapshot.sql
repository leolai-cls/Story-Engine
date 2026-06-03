-- 0058 · Redo-turn support — pre-turn world-state snapshot.
--
-- Founder ask (2026-06-03): "add a button for redo the turn". Redo = undo the
-- last exchange + regenerate from the same player input. To avoid COMPOUNDING
-- state (the extractor emits `inc` ops, e.g. forest_threats +2 — replaying on
-- top of the discarded turn's state would double-count), undoLastTurn restores
-- playthroughs.current_state to its value BEFORE the discarded turn.
--
-- We snapshot that pre-turn state on the USER turn row when it is inserted
-- (turn route · pt.current_state is read once at request start, so it is the
-- state before this turn). Nullable: pre-0058 turns + the rare non-atomic
-- fallback insert path have no snapshot — undoLastTurn degrades gracefully
-- (skips the state restore · logs) rather than failing.
--
-- Additive + backward-compatible: existing code that does not write this column
-- keeps working, so this migration is SAFE to apply before the route change
-- ships (and MUST be applied first — the route will start writing it).

alter table public.turns
  add column if not exists state_before jsonb;

comment on column public.turns.state_before is
  'Snapshot of playthroughs.current_state BEFORE this turn pair (written on the user turn). undoLastTurn (redo) restores it so regeneration does not compound state deltas. Nullable for pre-0058 / fallback-path turns.';
