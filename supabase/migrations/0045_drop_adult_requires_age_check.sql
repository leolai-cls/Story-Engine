-- Migration 0045 · 2026-05-29 · ADR-023 follow-up
-- Migration 0044 修咗 trigger 但漏咗呢個 column-level CHECK constraint:
--   profiles_adult_requires_age: CHECK (adult_mode_enabled=false OR is_age_verified=true)
-- 呢個 constraint 令 set adult_mode_enabled=true (但 is_age_verified=false) 直接
-- violate → setAdultMode server action throw → "This page couldn't load" crash.
-- ADR-023: self-attest 18+ · NO KYC · drop the constraint.

alter table public.profiles
  drop constraint if exists profiles_adult_requires_age;
