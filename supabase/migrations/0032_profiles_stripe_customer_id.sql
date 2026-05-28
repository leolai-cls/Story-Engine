-- Migration 0032 · Audit Wave 3 fix · Free top-up users have no portal access
-- ============================================================================
-- Agent B Wave 3 🟡: Free user buys top-up → Stripe creates Customer →
-- webhook fires grantTopUpCredits which writes ledger BUT no row in
-- `subscriptions` table. settings/page.tsx gates BillingPortalButton on
-- `subscriptions.stripe_customer_id` → Free top-up user CANNOT manage
-- saved card / view invoice history / remove payment method.
--
-- Fix: persist customer_id on profiles directly. Webhook writes it on every
-- checkout.session.completed (sub OR top-up). BillingPortalButton then has
-- a fallback source.
--
-- Source-of-truth note (Session 16 CRIT-01): committed retroactively to repo
-- from prod migration history on 2026-05-28.
-- ============================================================================

alter table public.profiles
  add column if not exists stripe_customer_id text;

-- Index for reverse lookup (Stripe customer → user) · sparse · most users have none
create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Backfill from existing subscriptions table (one-time data sync)
update public.profiles p
set stripe_customer_id = s.stripe_customer_id
from public.subscriptions s
where s.user_id = p.id
  and p.stripe_customer_id is null
  and s.stripe_customer_id is not null;

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer ID for this user. Set by webhook on first checkout (subscription or top-up). Enables Customer Portal access for Free users who only did one-time top-ups.';
