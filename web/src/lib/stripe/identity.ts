/**
 * Stripe Identity · age verification (KYC) for adult mode unlock.
 *
 * Flow:
 *   1. User clicks「驗證年齡」on /settings adult-mode section
 *   2. Server action calls createIdentityVerificationSession() → hosted URL
 *   3. Redirect user to Stripe-hosted verification page (selfie + ID)
 *   4. User completes verification → Stripe redirects to return_url
 *   5. Webhook fires identity.verification_session.verified
 *      → service-role writes profiles.is_age_verified = true
 *   6. UI re-renders · toggle now unlockable
 *
 * Hard rules (CLAUDE.md):
 *   - is_age_verified writes ONLY via service_role (webhook · never user-action)
 *   - Adult mode requires is_age_verified=true (DB CHECK + trigger enforce)
 *   - NSFW LLM routing requires both flags (lib/billing/credits.ts)
 *
 * Requires Stripe Identity enabled in dashboard (Settings → Identity). On
 * test mode it's typically auto-enabled. Verification fee is per attempt
 * in live mode (~$1.50) · test mode is free.
 */

import { getStripe } from "./client";

export async function createIdentityVerificationSession({
  userId,
  returnUrl,
  email,
}: {
  userId: string;
  returnUrl: string;
  email?: string;
}) {
  const stripe = getStripe();

  // type "document" is the standard age verification flow · captures a
  // government ID and verifies it against the photo. Stripe extracts DOB
  // and we can read it via session.verified_outputs after success.
  return stripe.identity.verificationSessions.create({
    type: "document",
    metadata: {
      user_id: userId,
      purpose: "adult_mode_age_verification",
      ...(email ? { email } : {}),
    },
    return_url: returnUrl,
    options: {
      document: {
        // Require a photo ID (passport, driver license, national ID)
        require_id_number: false,
        require_live_capture: true, // selfie liveness check
        require_matching_selfie: true,
      },
    },
    // The provided_details email helps Stripe match identity in case of
    // appeal/manual review — Stripe support uses this only.
    ...(email ? { provided_details: { email } } : {}),
  });
}
